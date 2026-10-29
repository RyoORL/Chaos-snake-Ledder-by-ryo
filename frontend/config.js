// Set PRODUCTION_SERVER to your deployed backend (https://...). No secrets here.
const PRODUCTION_SERVER = 'https://YOUR-BACKEND.onrender.com';
window.SERVER_URL = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:3000' : PRODUCTION_SERVER;
