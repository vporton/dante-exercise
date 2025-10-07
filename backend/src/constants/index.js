const { ERROR_MESSAGES } = require("./error-messages");
const API_HOST = 'eth-mainnet-alchemy.com';
const API_SUB_URL = 'service/token';
const SAMPLE_API_KEY = '1a049de15ad9d038a35f0e8b162dff76';
const API_HEADERS = {
  "x-secret-header": "secret",
};
const API_URL = `http://${API_HOST}/api/${API_SUB_URL}/${SAMPLE_API_KEY}`;

module.exports = {
    ERROR_MESSAGES,
    SAMPLE_API_KEY,
    API_SUB_URL,
    API_HOST,
    API_HEADERS,
    API_URL,
};