const express = require('express');
const router = express.Router();
const { auth, db } = require('../firebase/config');
const { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential
} = require('firebase/auth');
const { collection, query, where, getDocs, doc, setDoc, getDoc, updateDoc } = require('firebase/firestore');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');

// Login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Sign in with Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;
    
    // Get additional user data from Firestore
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    let userData = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      emailVerified: firebaseUser.emailVerified
    };
    
    // Add Firestore data if it exists
    if (userDoc.exists()) {
      userData = {
        ...userData,
        ...userDoc.data()
      };
    }
    
    // Create JWT token
    const payload = {
      user: {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || userData.fullName,
        photoURL: firebaseUser.photoURL || userData.photoURL
      }
    };
    
    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '7d' },
      (err, token) => {
        if (err) throw err;
        res.json({ token, user: payload.user });
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    
    // Handle specific Firebase auth errors
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      return res.status(401).json({ message: 'Invalid credentials' });
    } else if (error.code === 'auth/too-many-requests') {
      return res.status(429).json({ message: 'Too many login attempts. Please try again later.' });
    }
    
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Logout route
router.post('/logout', (req, res) => {
  // Since JWT is stateless, we don't need to do anything on the server
  // The client will remove the token
  res.status(200).json({ message: 'Logged out successfully' });
});

// Verify token route
router.get('/verify', authMiddleware, (req, res) => {
  // If middleware passes, token is valid
  // Return user data from the token
  res.status(200).json({
    valid: true,
    user: req.user
  });
});

// Signup route
router.post('/signup', async (req, res) => {
  try {
    const { email, password, displayName, college } = req.body;
    
    if (!email || !password || !displayName) {
      return res.status(400).json({ message: 'Email, password, and name are required' });
    }
    
    // Create user with email and password
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Update display name in Firebase Auth
    await updateProfile(user, {
      displayName: displayName
    });
    
    // Create a user document in Firestore
    await setDoc(doc(db, "users", user.uid), {
      fullName: displayName,
      email: email,
      college: college || "",
      createdAt: new Date(),
      lastLogin: new Date()
    });
    
    // Create JWT token
    const token = jwt.sign(
      { 
        uid: user.uid,
        email: user.email,
        displayName: displayName
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );
    
    // Return user info and token
    res.status(201).json({
      token,
      user: {
        uid: user.uid,
        email: user.email,
        displayName: displayName,
        college: college || ""
      }
    });
    
  } catch (error) {
    console.error('Signup error:', error);
    
    // Handle specific Firebase auth errors
    if (error.code === 'auth/email-already-in-use') {
      return res.status(400).json({ message: 'This email is already registered. Please use a different email or login.' });
    } else if (error.code === 'auth/weak-password') {
      return res.status(400).json({ message: 'Password is too weak. Please use at least 6 characters.' });
    } else if (error.code === 'auth/invalid-email') {
      return res.status(400).json({ message: 'Invalid email address format.' });
    }
    
    res.status(500).json({ message: 'Registration failed. Please try again.' });
  }
});

// Google Sign In route
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    
    if (!credential) {
      return res.status(400).json({ message: 'No Google credential provided' });
    }
    
    // Create auth provider
    const provider = new GoogleAuthProvider();
    
    // Sign in with credential from the Google user
    const auth_credential = GoogleAuthProvider.credential(credential);
    const userCredential = await signInWithCredential(auth, auth_credential);
    const firebaseUser = userCredential.user;
    
    // Check if user exists in Firestore
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    
    if (!userDoc.exists()) {
      // Create new user document if it doesn't exist
      await setDoc(doc(db, 'users', firebaseUser.uid), {
        fullName: firebaseUser.displayName,
        email: firebaseUser.email,
        photoURL: firebaseUser.photoURL,
        createdAt: new Date(),
        lastLogin: new Date()
      });
    } else {
      // Update last login for existing user
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        lastLogin: new Date()
      });
    }
    
    // Create JWT token
    const token = jwt.sign(
      {
        user: {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL
        }
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({ 
      token, 
      user: {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL
      }
    });
    
  } catch (error) {
    console.error('Google sign in error:', error);
    res.status(500).json({ message: 'Google sign in failed: ' + error.message });
  }
});

module.exports = router;