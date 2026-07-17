const { PDFParse } = require('pdf-parse');
const fs = require('fs');

async function main() {
    const dataBuffer = fs.readFileSync('D:/resume aditya singh rajput.pdf');
    const parser = new PDFParse({ data: dataBuffer });
    await parser.load();
    const result = await parser.getText();
    console.log('Result constructor name:', result.constructor.name);
    console.log('Result keys:', Object.keys(result));
    if (result.text) {
        console.log('Result text length:', result.text.length);
        console.log('Sample:', result.text.substring(0, 300));
    }
}
main().catch(console.error);
