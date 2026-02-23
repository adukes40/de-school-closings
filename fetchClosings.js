const axios = require('axios');
const cheerio = require('cheerio');

const fetchClosings = async () => {
    try {
        const { data } = await axios.get('https://schoolclosings.delaware.gov/');
        const $ = cheerio.load(data);
        const closings = [];

        $('.closing').each((index, element) => {
            const school = $(element).find('.school-name').text().trim();
            const status = $(element).find('.closure-status').text().trim();
            closings.push({ school, status });
        });

        return closings;
    } catch (error) {
        console.error('Error fetching the school closings:', error);
        return [];
    }
};

fetchClosings().then(closings => console.log(closings));
