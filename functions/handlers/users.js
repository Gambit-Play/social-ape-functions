const { db, admin } = require('../utils/admin');
const firebase = require('firebase');
const firebaseConfig = require('../utils/firebaseConfig');
const {
	validateSignUpData,
	validateLoginData,
	reduceUserDetails
} = require('../utils/validators');

// Initialize app with firebase configurations
firebase.initializeApp(firebaseConfig);

// Sign user up
exports.signup = (req, res) => {
	const newUser = {
		email: req.body.email,
		password: req.body.password,
		confirmPassword: req.body.confirmPassword,
		handle: req.body.handle
	};

	const { errors, valid } = validateSignUpData(newUser);

	if (!valid) return res.status(400).json(errors);

	const noImg = 'no-img.png';

	let token, userId;

	db.doc(`/users/${newUser.handle}`)
		.get()
		.then(doc => {
			console.log(doc);
			if (doc.exists) {
				return res
					.status(500)
					.json({ handle: 'This handle is already taken' });
			} else {
				return firebase
					.auth()
					.createUserWithEmailAndPassword(
						newUser.email,
						newUser.password
					);
			}
		})
		.then(data => {
			userId = data.user.uid;
			return data.user.getIdToken(true);
		})
		.then(idToken => {
			token = idToken;
			const userCredentials = {
				handle: newUser.handle,
				email: newUser.email,
				createdAt: new Date().toISOString(),
				imageUrl: `https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o/${noImg}?alt=media`,
				userId
			};
			return db.doc(`/users/${newUser.handle}`).set(userCredentials);
		})
		.then(() => {
			return res.status(201).json({ token });
		})
		.catch(err => {
			console.error(err);
			if (err.code === 'auth/email-already-in-use')
				return res.status(400).json({
					error:
						'The email address is already in use by another account.'
				});
			res.status(500).json({ error: err.message });
		});
};

// Log user in
exports.login = (req, res) => {
	const user = {
		email: req.body.email,
		password: req.body.password
	};

	const { errors, valid } = validateLoginData(user);

	if (!valid) return res.status(400).json(errors);

	firebase
		.auth()
		.signInWithEmailAndPassword(user.email, user.password)
		.then(data => {
			return data.user.getIdToken(true);
		})
		.then(token => {
			return res.json({ token });
		})
		.catch(err => {
			console.error(err);
			if (err.code === 'auth/wrong-password')
				return res
					.status(403)
					.json({ general: 'Wrong password, please try again' });
			return res.status(500).json({ error: err.message });
		});
};

// Add user details
exports.addUserDetails = (req, res) => {
	let userDetails = reduceUserDetails(req.body);

	db.doc(`/users/${req.user.handle}`)
		.update(userDetails)
		.then(() => {
			return res.json({ message: 'Details added successfully' });
		})
		.catch(err => {
			console.error(err);
			return res.status(500).json({ error: err.message });
		});
};

// Get any user´s detail
exports.getUserDetail = (req, res) => {
	let userData = {};

	db.doc(`/users/${req.params.handle}`)
		.get()
		.then(doc => {
			if (doc.exists) {
				userData.user = doc.data();

				return db
					.collection('screams')
					.where('userHandle', '==', req.params.handle)
					.orderBy('createdAt', 'desc')
					.get();
			} else {
				return res.status(404).json({ error: 'User not found' });
			}
		})
		.then(data => {
			userData.screams = [];

			data.forEach(doc => {
				userData.screams.push({
					body: doc.data().body,
					createdAt: doc.data().createdAt,
					userHandle: doc.data().userHandle,
					userImage: doc.data().userImage,
					likeCount: doc.data().likeCount,
					commentCount: doc.data().commentCount,
					screamId: doc.id
				});
			});

			return res.json(userData);
		})
		.catch(err => {
			console.error(err);
			return res.status(500).json({ error: err.message });
		});
};

// Get own user details
exports.getAthenticatedUser = (req, res) => {
	let userData = {};

	db.doc(`/users/${req.user.handle}`)
		.get()
		.then(doc => {
			if (doc.exists) {
				userData.credentials = doc.data();

				return db
					.collection('likes')
					.where('userHandle', '==', req.user.handle)
					.get();
			}
		})
		.then(data => {
			userData.likes = [];

			data.forEach(doc => {
				userData.likes.push(doc.data());
			});

			return db
				.collection('notifications')
				.where('recipient', '==', req.user.handle)
				.orderBy('createdAt', 'desc')
				.limit(10)
				.get();
		})
		.then(data => {
			userData.notifications = [];

			data.forEach(doc => {
				userData.notifications.push({
					recipient: doc.data().recipient,
					sender: doc.data().sender,
					createdAt: doc.data().createdAt,
					screamId: doc.data().screamId,
					type: doc.data().type,
					read: doc.data().read,
					notificationId: doc.id
				});
			});

			return res.json(userData);
		})
		.catch(err => {
			console.error(err);
			return res.status(500).json({ error: err.code });
		});
};

// Upload a profile image for the user
exports.uploadImage = (req, res) => {
	const Busboy = require('busboy');
	const path = require('path');
	const os = require('os');
	const fs = require('fs');

	const busboy = new Busboy({ headers: req.headers });

	let imageFileName;
	let imageToBeUploaded = {};

	busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
		// Checks if the uploaded file is an image
		if (mimetype.includes('image') === false)
			return res
				.status(400)
				.json({ error: 'Wrong file type, please submit an image.' });

		// Gets the last index where the filetype is held.
		// Example: my.image.png > The last index is "png"
		const imageExtension = filename.split('.').pop();

		// Example: 567262357.png
		imageFileName = `${Math.round(
			Math.random() * 1000000000000
		)}.${imageExtension}`;

		const filepath = path.join(os.tmpdir(), imageFileName);

		imageToBeUploaded = { filepath, mimetype };

		file.pipe(fs.createWriteStream(filepath));
	});

	busboy.on('finish', () => {
		admin
			.storage()
			.bucket(firebaseConfig.storageBucket)
			.upload(imageToBeUploaded.filepath, {
				resumable: false,
				metadata: {
					metadata: {
						contentType: imageToBeUploaded.mimetype
					}
				}
			})
			.then(() => {
				const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o/${imageFileName}?alt=media`;

				return db.doc(`/users/${req.user.handle}`).update({ imageUrl });
			})
			.then(() => {
				return res.json({ message: 'Image uploaded successfully' });
			})
			.catch(err => {
				return res.status(500).json({ error: err.message });
			});
	});

	busboy.end(req.rawBody);
};

exports.markNotificationsRead = (req, res) => {
	let batch = db.batch();

	req.body.forEach(notificationId => {
		const notification = db.doc(`/notifications/${notificationId}`);

		batch.update(notification, { read: true });
	});

	batch
		.commit()
		.then(() => {
			return res.json({ message: 'Notifications marked read' });
		})
		.catch(err => {
			console.error(err);
			return res.status(500).json({ error: err.message });
		});
};
