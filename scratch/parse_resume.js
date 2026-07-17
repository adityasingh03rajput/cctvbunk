const { PDFParse } = require('pdf-parse');
const fs = require('fs');

async function main() {
    const dataBuffer = fs.readFileSync('D:/resume aditya singh rajput.pdf');
    const parser = new PDFParse({ data: dataBuffer });
    await parser.load();
    const result = await parser.getText();
    console.log('Successfully extracted! Text length:', result.text.length);
    fs.writeFileSync('D:/bunk bssid/scratch/extracted_resume.txt', result.text);
}

main().catch(console.error);
