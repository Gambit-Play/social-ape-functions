const admin = require('firebase-admin');
const serviceAccount = require('../key/social-ape-9fbe3503c8ec.json');

// Initialize admin with credentials
admin.initializeApp({
	credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

module.exports = { admin, db };
