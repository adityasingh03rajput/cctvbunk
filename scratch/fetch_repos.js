const { execSync } = require('child_process');
const fs = require('fs');

async function main() {
    console.log('Fetching repository list...');
    const reposData = execSync('gh repo list adityasingh03rajput --limit 100').toString();
    const lines = reposData.split('\n').filter(line => line.trim().length > 0);
    
    const results = [];

    for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length < 2) continue;
        const repoFullName = parts[0];
        const visibility = parts[2];
        const lastUpdated = parts[3];
        const description = parts[1] || 'No description';

        console.log(`Fetching details for ${repoFullName}...`);
        try {
            // Get README content
            const readme = execSync(`gh repo view ${repoFullName}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
            
            // Extract the first few lines of the README (e.g. first header or description)
            const readmeClean = readme.split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0)
                .slice(0, 15)
                .join('\n');

            results.push({
                name: repoFullName,
                description,
                visibility,
                lastUpdated,
                readmeSummary: readmeClean
            });
        } catch (e) {
            results.push({
                name: repoFullName,
                description,
                visibility,
                lastUpdated,
                readmeSummary: 'Could not fetch readme'
            });
        }
    }

    fs.writeFileSync('D:/bunk bssid/scratch/all_repos_details.json', JSON.stringify(results, null, 2));
    console.log(`Saved ${results.length} repo details.`);
}

main().catch(console.error);
