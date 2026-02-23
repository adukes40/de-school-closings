const fetch = require('node-fetch');

async function fetchClosings() {
    const response = await fetch('http://schoolclosings.delaware.gov');
    const html = await response.text();
    console.log('HTML Structure:', html);
}

fetchClosings();