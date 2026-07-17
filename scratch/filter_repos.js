const fs = require('fs');

const data = JSON.parse(fs.readFileSync('D:/bunk bssid/scratch/all_repos_details.json', 'utf8'));

let output = '--- FILTERED REPOSITORIES ---\n';

for (const repo of data) {
    const name = repo.name;
    const desc = repo.description;
    const summary = repo.readmeSummary;
    
    if (summary === 'Could not fetch readme' || summary === '') continue;
    if (summary.toLowerCase().includes('forked from')) continue;
    
    const lines = summary.split('\n');
    if (lines.length <= 2 && desc === 'No description') continue;
    
    output += `\n==================================================\n`;
    output += `Repository: ${name} (${repo.visibility})\n`;
    output += `Description: ${desc}\n`;
    output += `Last Updated: ${repo.lastUpdated}\n`;
    output += `Readme Header/Snippet:\n${lines.slice(0, 15).join('\n')}\n`;
    output += `==================================================\n`;
}

fs.writeFileSync('D:/bunk bssid/scratch/filtered_repos_output.txt', output);
console.log('Done writing filtered output!');
