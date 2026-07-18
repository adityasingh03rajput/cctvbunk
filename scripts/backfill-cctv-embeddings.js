/**
 * Backfill faceEmbeddingCctv for already-enrolled students.
 *
 * For each StudentManagement doc with a photoUrl but no faceEmbeddingCctv:
 * download the photo, send it to the embedding service, store the 512D result.
 * Students without a stored photo need a one-time re-capture in the enrollment app.
 *
 * Usage: node scripts/backfill-cctv-embeddings.js
 * Requires: MongoDB reachable (MONGODB_URI) + embedding service running (EMBEDDING_SERVICE_URL).
 */

try { require('dotenv').config(); } catch (_) { /* dotenv optional — env vars can be passed directly */ }
const mongoose = require('mongoose');
const axios = require('axios');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance_app';
const EMBEDDING_SERVICE_URL = process.env.EMBEDDING_SERVICE_URL || 'https://spyfromsky-80093.centralindia.cloudapp.azure.com';
const EMBED_SHARED_SECRET = process.env.EMBED_SHARED_SECRET || '';
const EMBED_HEADERS = EMBED_SHARED_SECRET ? { 'x-embed-secret': EMBED_SHARED_SECRET } : {};
const QUALITY_FLOOR = parseFloat(process.env.CCTV_QUALITY_FLOOR || '0.35');

async function main() {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Health check embedding service first
    try {
        await axios.get(`${EMBEDDING_SERVICE_URL}/health`, { timeout: 120000 }); // Render cold start can take minutes
    } catch (e) {
        console.error(`❌ Embedding service not reachable at ${EMBEDDING_SERVICE_URL} — start it first.`);
        process.exit(1);
    }

    const coll = mongoose.connection.collection('studentmanagements');
    const students = await coll.find({
        photoUrl: { $exists: true, $nin: [null, ''] },
        $or: [
            { faceEmbeddingCctv: { $exists: false } },
            { faceEmbeddingCctv: null },
            { faceEmbeddingCctv: { $size: 0 } }
        ]
    }).project({ enrollmentNo: 1, name: 1, photoUrl: 1 }).toArray();

    console.log(`${students.length} students to backfill`);
    let ok = 0, lowQ = 0, noFace = 0, failed = 0;

    for (const s of students) {
        try {
            const imgResp = await axios.get(s.photoUrl, { responseType: 'arraybuffer', timeout: 20000 });
            const imageBase64 = Buffer.from(imgResp.data).toString('base64');
            const embResp = await axios.post(`${EMBEDDING_SERVICE_URL}/embed`, { image_base64: imageBase64 }, { timeout: 120000, headers: EMBED_HEADERS });
            const r = embResp.data;

            if (!r.success) {
                console.log(`  ⚠️ ${s.enrollmentNo} (${s.name}): ${r.message}`);
                noFace++;
                continue;
            }
            if (r.quality_score < QUALITY_FLOOR) {
                console.log(`  ⚠️ ${s.enrollmentNo} (${s.name}): quality too low (${r.quality_score}) — needs re-capture`);
                lowQ++;
                continue;
            }
            await coll.updateOne(
                { _id: s._id },
                { $set: { faceEmbeddingCctv: r.embedding, faceCctvEnrolledAt: new Date() } }
            );
            console.log(`  ✅ ${s.enrollmentNo} (${s.name}) quality=${r.quality_score}`);
            ok++;
        } catch (err) {
            console.log(`  ❌ ${s.enrollmentNo} (${s.name}): ${err.message}`);
            failed++;
        }
    }

    console.log(`\nDone: ${ok} backfilled, ${lowQ} low quality, ${noFace} no face, ${failed} errors`);
    console.log('Students not backfilled need a one-time re-capture in the enrollment app.');
    await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
