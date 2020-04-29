const functions = require('firebase-functions');
const app = require('express')();
const FBAuth = require('./utils/FBAuth');
const { db } = require('./utils/admin');
const {
	getAllScreams,
	postOneScreams,
	getScream,
	commentOnScream,
	likeScream,
	unlikeScream,
	deleteScream,
} = require('./handlers/screams');
const {
	signup,
	login,
	uploadImage,
	addUserDetails,
	getAthenticatedUser,
	getUserDetail,
	markNotificationsRead,
} = require('./handlers/users');

/*===============================================================*/
/* Scream Routes												 */
/*===============================================================*/
// Get Screams
app.get('/screams', getAllScreams);

// Create a Scream
app.post('/scream', FBAuth, postOneScreams);

// Get a scream
app.get('/scream/:screamId', getScream);

// Comment on a scream
app.post('/scream/:screamId/comment', FBAuth, commentOnScream);

// Like a scream
app.get('/scream/:screamId/like', FBAuth, likeScream);

// Unlike a scream
app.get('/scream/:screamId/unlike', FBAuth, unlikeScream);

// Delete a scream
app.delete('/scream/:screamId', FBAuth, deleteScream);

/*===============================================================*/
/* Users Routes 												 */
/*===============================================================*/
// User Signup
app.post('/signup', signup);

// User Login
app.post('/login', login);

// Upload Image
app.post('/user/image', FBAuth, uploadImage);

// Add user details to the user
app.post('/user', FBAuth, addUserDetails);

// Get user´s data
app.get('/user', FBAuth, getAthenticatedUser);

// Get users details
app.get('/user/:handle', getUserDetail);

// Mark notifications as read
app.post('/notifications', FBAuth, markNotificationsRead);

/*===============================================================*/

exports.api = functions.region('europe-west1').https.onRequest(app);

exports.createNotificationOnLike = functions
	.region('europe-west1')
	.firestore.document('likes/{id}')
	.onCreate(snapshot => {
		return db
			.doc(`/screams/${snapshot.data().screamId}`)
			.get()
			.then(doc => {
				if (
					doc.exists &&
					doc.data().userHandle !== snapshot.data().userHandle
				)
					return db.doc(`/notifications/${snapshot.id}`).set({
						createdAt: new Date().toISOString(),
						recipient: doc.data().userHandle,
						sender: snapshot.data().userHandle,
						type: 'like',
						read: false,
						screamId: doc.id,
					});
			})
			.catch(err => {
				console.error(err);
			});
	});

exports.deleteNotificationOnUnLike = functions
	.region('europe-west1')
	.firestore.document('likes/{id}')
	.onDelete(snapshot => {
		return db
			.doc(`/notifications/${snapshot.id}`)
			.delete()
			.catch(err => console.error(err));
	});

exports.createNotificationOnComment = functions
	.region('europe-west1')
	.firestore.document('comments/{id}')
	.onCreate(snapshot => {
		return db
			.doc(`/screams/${snapshot.data().screamId}`)
			.get()
			.then(doc => {
				if (
					doc.exists &&
					doc.data().userHandle !== snapshot.data().userHandle
				)
					return db.doc(`/notifications/${snapshot.id}`).set({
						createdAt: new Date().toISOString(),
						recipient: doc.data().userHandle,
						sender: snapshot.data().userHandle,
						type: 'comment',
						read: false,
						screamId: doc.id,
					});
			})
			.catch(err => console.error(err));
	});

exports.onUserImageChange = functions
	.region('europe-west1')
	.firestore.document('users/{userId}')
	.onUpdate(change => {
		console.log(change.before.data());
		console.log(change.after.data());

		if (change.before.data().imageUrl !== change.after.data().imageUrl) {
			console.log('Image has changed');
			const batch = db.batch();

			return db
				.collection('screams')
				.where('userHandle', '==', change.before.data().handle)
				.get()
				.then(data => {
					data.forEach(doc => {
						const scream = db.doc(`/screams/${doc.id}`);

						batch.update(scream, {
							userImage: change.after.data().imageUrl,
						});
					});

					return batch.commit();
				})
				.catch(err => console.error(err));
		} else {
			return true;
		}
	});

exports.onScreamDelete = functions
	.region('europe-west1')
	.firestore.document('screams/{screamId}')
	.onDelete((snapshot, context) => {
		const screamId = context.params.screamId;
		const batch = db.batch();

		return db
			.collection('comments')
			.where('screamId', '==', screamId)
			.get()
			.then(data => {
				data.forEach(doc => {
					batch.delete(db.doc(`/comments/${doc.id}`));
				});

				return db
					.collection('likes')
					.where('screamId', '==', screamId)
					.get();
			})
			.then(data => {
				data.forEach(doc => {
					batch.delete(db.doc(`/likes/${doc.id}`));
				});

				return db
					.collection('notifications')
					.where('screamId', '==', screamId)
					.get();
			})
			.then(data => {
				data.forEach(doc => {
					batch.delete(db.doc(`/notifications/${doc.id}`));
				});

				return batch.commit();
			})
			.catch(err => console.error(err));
	});
