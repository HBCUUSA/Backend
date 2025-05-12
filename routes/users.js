const express = require('express');
const router = express.Router();
const { db, storage } = require('../firebase/config');
const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
const { ref, uploadBytes, getDownloadURL } = require('firebase/storage');
const authMiddleware = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// Protect all user routes
router.use(authMiddleware);

// Get user profile
router.get('/profile', async (req, res) => {
  try {
    // Ensure req.user exists and has uid
    if (!req.user || !req.user.uid) {
      console.error('User object missing or invalid:', req.user);
      return res.status(401).json({ message: 'User authentication failed' });
    }
    
    const uid = req.user.uid;
    console.log('Fetching profile for user:', uid);
    
    // Get user document from Firestore
    const userDocRef = doc(db, "users", uid);
    const userDoc = await getDoc(userDocRef);
    
    if (userDoc.exists()) {
      res.status(200).json(userDoc.data());
    } else {
      // Create user document if it doesn't exist
      const userData = {
        fullName: req.user.displayName || "",
        email: req.user.email || "",
        phoneNumber: "",
        college: "",
        photoURL: req.user.photoURL || "",
        createdAt: new Date()
      };
      
      await setDoc(userDocRef, userData);
      res.status(200).json(userData);
    }
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Failed to fetch user profile' });
  }
});

// Update user profile
router.put('/profile', async (req, res) => {
  try {
    const uid = req.user.uid;
    const userData = req.body;
    
    // Remove fields that shouldn't be directly updated
    delete userData.email; // Email should be updated through Firebase Auth
    
    // Update Firestore document
    const userDocRef = doc(db, "users", uid);
    await updateDoc(userDocRef, {
      ...userData,
      updatedAt: new Date()
    });
    
    res.status(200).json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ message: 'Failed to update user profile' });
  }
});

// Upload profile image
router.post('/upload-profile-image', upload.single('profileImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }
    
    const uid = req.user.uid;
    const timestamp = new Date().getTime();
    const filePath = `profilePictures/${uid}_${timestamp}`;
    
    console.log('Uploading image for user:', uid);
    console.log('File details:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
    
    // Create a reference to the storage location
    const storageRef = ref(storage, filePath);
    
    // Upload the file buffer
    const snapshot = await uploadBytes(storageRef, req.file.buffer, {
      contentType: req.file.mimetype
    });
    
    console.log('File uploaded successfully');
    
    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref);
    console.log('Download URL:', downloadURL);
    
    // Update user document with new photo URL
    const userDocRef = doc(db, "users", uid);
    await updateDoc(userDocRef, {
      photoURL: downloadURL,
      photoStoragePath: filePath,
      updatedAt: new Date()
    });
    
    res.status(200).json({
      downloadURL,
      storagePath: filePath
    });
  } catch (error) {
    console.error('Error uploading profile image:', error);
    res.status(500).json({ message: `Failed to upload profile image: ${error.message}` });
  }
});

module.exports = router; 