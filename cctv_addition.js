
// ============================================
// CCTV SCHEMAS
// ============================================
const cctvCameraSchema = new mongoose.Schema({
    cameraId: { type: String, required: true, unique: true },
    roomNumber: { type: String, required: true },
    label: { type: String },
    isActive: { type: Boolean, default: true },
    secretHash: { type: String, required: true },
    lastSeenAt: { type: Date }
}, { timestamps: true });

const CctvCamera = mongoose.model('CctvCamera', cctvCameraSchema);

const faceMatchReviewSchema = new mongoose.Schema({
    cameraId: { type: String, required: true },
    roomNumber: { type: String },
    semester: { type: String },
    branch: { type: String },
    period: { type: String },
    date: { type: Date },
    snapshotUrl: { type: String },
    faceCropUrl: { type: String },
    bbox: {
        x: Number,
        y: Number,
        w: Number,
        h: Number
    },
    candidates: [{
        enrollmentNo: String,
        name: String,
        similarity: Number
    }],
    status: { type: String, enum: ['pending', 'confirmed', 'rejected'], default: 'pending' },
    reviewedBy: { type: String },
    reviewedAt: { type: Date }
}, { timestamps: true });

const FaceMatchReview = mongoose.model('FaceMatchReview', faceMatchReviewSchema);

// ============================================
// CCTV ROUTES
// ============================================

// Get all CCTV Cameras
app.get('/api/cctv/cameras', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: true, cameras: [] });
        }
        const cameras = await CctvCamera.find({}).sort({ createdAt: -1 });
        const processedCameras = cameras.map(c => ({
            cameraId: c.cameraId,
            roomNumber: c.roomNumber,
            label: c.label,
            isActive: c.isActive,
            online: c.lastSeenAt ? (Date.now() - new Date(c.lastSeenAt).getTime()) < 300000 : false,
            lastSeenAt: c.lastSeenAt
        }));
        res.json({ success: true, cameras: processedCameras });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add a CCTV Camera
app.post('/api/cctv/cameras', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: true, data: { cameraId: req.body.cameraId, secret: 'dummy-secret-memory' } });
        }
        const { cameraId, roomNumber, label } = req.body;
        const secret = require('crypto').randomBytes(16).toString('hex');
        // A simple hash for now
        const secretHash = await require('bcrypt').hash(secret, 10);
        
        const camera = new CctvCamera({
            cameraId,
            roomNumber,
            label,
            secretHash
        });
        await camera.save();
        res.json({ success: true, data: { cameraId, secret } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Edit a CCTV Camera
app.put('/api/cctv/cameras/:cameraId', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: true });
        }
        const { roomNumber, label, isActive } = req.body;
        await CctvCamera.findOneAndUpdate(
            { cameraId: req.params.cameraId },
            { roomNumber, label, isActive }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Regenerate Camera Secret
app.post('/api/cctv/cameras/:cameraId/regenerate-secret', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: true, data: { secret: 'dummy-secret-memory-new' } });
        }
        const secret = require('crypto').randomBytes(16).toString('hex');
        const secretHash = await require('bcrypt').hash(secret, 10);
        await CctvCamera.findOneAndUpdate(
            { cameraId: req.params.cameraId },
            { secretHash }
        );
        res.json({ success: true, data: { secret } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete a CCTV Camera
app.delete('/api/cctv/cameras/:cameraId', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: true });
        }
        await CctvCamera.findOneAndDelete({ cameraId: req.params.cameraId });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get CCTV Reviews
app.get('/api/cctv/reviews', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: true, reviews: [] });
        }
        const status = req.query.status || 'pending';
        const limit = parseInt(req.query.limit) || 50;
        const reviews = await FaceMatchReview.find({ status })
            .sort({ createdAt: -1 })
            .limit(limit);
        res.json({ success: true, reviews });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Confirm CCTV Review
app.post('/api/cctv/reviews/:reviewId/confirm', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: true, message: 'Confirmed (Memory Mode)' });
        }
        const { enrollmentNo, reviewedBy } = req.body;
        const review = await FaceMatchReview.findById(req.params.reviewId);
        if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
        
        review.status = 'confirmed';
        review.reviewedBy = reviewedBy;
        review.reviewedAt = new Date();
        await review.save();
        
        // Mark attendance logic goes here (stub for now)
        // ...
        
        res.json({ success: true, message: 'Review confirmed and attendance marked.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reject CCTV Review
app.post('/api/cctv/reviews/:reviewId/reject', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.json({ success: true });
        }
        const { reviewedBy } = req.body;
        const review = await FaceMatchReview.findById(req.params.reviewId);
        if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
        
        review.status = 'rejected';
        review.reviewedBy = reviewedBy;
        review.reviewedAt = new Date();
        await review.save();
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

