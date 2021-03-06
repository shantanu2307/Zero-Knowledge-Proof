const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase.json');

const express = require('express');
const cors = require('cors');

const crypto = require('crypto');
const CryptoJS = require('crypto-js');

const app = express();
const port = process.env.PORT || 8000;

initializeApp({
    credential: cert(serviceAccount)
});

app.use(cors());
app.use(express.json());

const database = getFirestore();

app.get('/', async (req, res) => {
    res.send('Hello World!');
})

app.post('/signup', async (req, res) => {
    try {
        const userDoc = database.collection('users').doc(req.body.username);
        const user = await userDoc.get();

        if (user.exists) {
            res.status(409).send({ message: 'Username already exists' });
            return;
        }

        const userData = {
            createdAt: FieldValue.serverTimestamp(),
            passwordHash: CryptoJS.SHA256(req.body.password).toString(),
            userData: {
                email: req.body.email,
                name: req.body.name,
                phone: req.body.phone,
                username: req.body.username,
                imageURL: `https://avatars.dicebear.com/api/miniavs/${req.body.username}.svg`,
            }
        }

        const saveResponse = await database.collection('users').doc(req.body.username).set(userData);
        res.status(200).send({ message: 'User created', data: saveResponse });
    }
    catch (error) {
        console.log(error);
        res.status(500).send(error);
    }
})

app.post('/login', async (req, res) => {
    try {
        const userRef = database.collection('users').doc(req.body.username);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            res.status(401).send({ message: 'User not found' });
            return;
        }

        const userPassword = userDoc.data().passwordHash;
        const challenge = crypto.randomBytes(32).toString('hex');
        const sessionKey = crypto.randomBytes(32).toString('hex');

        const base64 = CryptoJS.AES.encrypt(req.body.challenge + sessionKey + challenge, userPassword).toString();
        const encodedBase64 = CryptoJS.enc.Base64.parse(base64);
        const encryptedChallenge = encodedBase64.toString(CryptoJS.enc.Hex);

        userRef.set({ sessionKey: sessionKey, challenge: challenge }, { merge: true });
        res.status(200).send({ challenge: encryptedChallenge });
    }
    catch (error) {
        console.log(error);
        res.status(500).send(error);
    }
});

app.post('/login-verify', async (req, res) => {
    try {
        const userRef = database.collection('users').doc(req.body.username);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            res.status(401).send({ message: 'User not found' });
            return;
        }

        const challenge = userDoc.data().challenge;
        const sessionKey = userDoc.data().sessionKey;

        const base64 = CryptoJS.enc.Hex.parse(req.body.proof);
        const bytes = base64.toString(CryptoJS.enc.Base64);
        const decrypt = CryptoJS.AES.decrypt(bytes, sessionKey);
        const receivedChallenge = decrypt.toString(CryptoJS.enc.Utf8);

        if (receivedChallenge !== challenge) {
            res.status(401).send({ message: 'Challenge mismatch, client not verified.' });
            return;
        }

        res.status(200).send({ message: 'Successfully Logged In', user: userDoc.data().userData });
    }
    catch (error) {
        console.log(error);
        res.status(500).send(error);
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`)
})