const express = require('express');
const router = express.Router();
const { storage } = require('../firebase/config');
const { ref, uploadBytes, getDownloadURL, deleteObject } = require('firebase/storage');
const { db } = require('../firebase/config');
const { doc, updateDoc, getDoc, collection, addDoc, query, where, getDocs, orderBy, deleteDoc, serverTimestamp, writeBatch } = require('firebase/firestore');
const authMiddleware = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// Upload resume
router.post('/upload', authMiddleware, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const userId = req.user.uid;
    const file = req.file;
    const fileExtension = file.originalname.split('.').pop();
    
    // Validate file type
    const allowedExtensions = ['pdf', 'doc', 'docx'];
    if (!allowedExtensions.includes(fileExtension.toLowerCase())) {
      return res.status(400).json({ 
        message: 'Invalid file type. Only PDF, DOC, and DOCX files are allowed.' 
      });
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ message: 'File size exceeds 5MB limit' });
    }

    // Check if user already has a resume
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists() && userDoc.data().resumePath) {
      // Delete the old resume
      try {
        const oldResumeRef = ref(storage, userDoc.data().resumePath);
        await deleteObject(oldResumeRef);
      } catch (error) {
        console.error('Error deleting old resume:', error);
        // Continue even if delete fails
      }
    }

    // Upload new resume
    const timestamp = Date.now();
    const resumePath = `resumes/${userId}/${timestamp}_${file.originalname}`;
    const storageRef = ref(storage, resumePath);
    
    // Set metadata
    const metadata = {
      contentType: file.mimetype,
    };
    
    // Upload file
    await uploadBytes(storageRef, file.buffer, metadata);
    
    // Get download URL
    const downloadURL = await getDownloadURL(storageRef);
    
    // Update user document with resume info
    const userData = userDoc.data();
    await updateDoc(userRef, {
      resumeURL: downloadURL,
      resumePath: resumePath,
      resumeName: file.originalname,
      resumeUpdatedAt: new Date(),
      resumePublic: userData?.resumePublic || false
    });
    
    res.status(200).json({
      message: 'Resume uploaded successfully',
      resumeURL: downloadURL,
      resumeName: file.originalname,
      isPublic: userData?.resumePublic || false
    });
  } catch (error) {
    console.error('Error uploading resume:', error);
    res.status(500).json({ message: 'Failed to upload resume' });
  }
});

// Get user's resume
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    if (!userData.resumeURL) {
      return res.status(404).json({ message: 'No resume found' });
    }
    
    res.status(200).json({
      resumeURL: userData.resumeURL,
      resumeName: userData.resumeName,
      resumeUpdatedAt: userData.resumeUpdatedAt,
      isPublic: userData.resumePublic || false
    });
  } catch (error) {
    console.error('Error getting resume:', error);
    res.status(500).json({ message: 'Failed to get resume' });
  }
});

// Delete resume
router.delete('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    if (!userData.resumePath) {
      return res.status(404).json({ message: 'No resume found' });
    }
    
    // Delete the resume from storage
    const resumeRef = ref(storage, userData.resumePath);
    await deleteObject(resumeRef);
    
    // Update user document
    await updateDoc(userRef, {
      resumeURL: null,
      resumePath: null,
      resumeName: null,
      resumeUpdatedAt: null
    });
    
    res.status(200).json({ message: 'Resume deleted successfully' });
  } catch (error) {
    console.error('Error deleting resume:', error);
    res.status(500).json({ message: 'Failed to delete resume' });
  }
});

// Get all public resumes (for feedback)
router.get('/public', authMiddleware, async (req, res) => {
  try {
    // Query users who have opted to make their resumes public
    const usersRef = collection(db, 'users');
    const q = query(
      usersRef,
      where('resumePublic', '==', true)
    );
    
    const querySnapshot = await getDocs(q);
    const publicResumes = [];
    
    querySnapshot.forEach((doc) => {
      const userData = doc.data();
      // Only include users who have a resume URL
      if (userData.resumeURL) {
        publicResumes.push({
          userId: doc.id,
          userName: userData.fullName,
          college: userData.college || 'Not specified',
          resumeURL: userData.resumeURL,
          resumeName: userData.resumeName,
          resumeUpdatedAt: userData.resumeUpdatedAt,
          photoURL: userData.photoURL || null
        });
      }
    });
    
    res.status(200).json(publicResumes);
  } catch (error) {
    console.error('Error getting public resumes:', error);
    res.status(500).json({ message: 'Failed to get public resumes' });
  }
});

// Toggle resume public status
router.put('/toggle-public', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    if (!userData.resumeURL) {
      return res.status(400).json({ message: 'You need to upload a resume first' });
    }
    
    // Toggle the public status
    const isPublic = userData.resumePublic === true;
    
    await updateDoc(userRef, {
      resumePublic: !isPublic
    });
    
    res.status(200).json({ 
      message: `Resume is now ${!isPublic ? 'public' : 'private'}`,
      isPublic: !isPublic
    });
  } catch (error) {
    console.error('Error toggling resume public status:', error);
    res.status(500).json({ message: 'Failed to update resume visibility' });
  }
});

// Get resume by user ID (for viewing other users' resumes)
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    if (!userData.resumeURL) {
      return res.status(404).json({ message: 'No resume found for this user' });
    }
    
    if (userData.resumePublic !== true && req.user.uid !== userId) {
      return res.status(403).json({ message: 'This resume is not public' });
    }
    
    res.status(200).json({
      userId: userId,
      userName: userData.fullName,
      college: userData.college || 'Not specified',
      resumeURL: userData.resumeURL,
      resumeName: userData.resumeName,
      resumeUpdatedAt: userData.resumeUpdatedAt,
      photoURL: userData.photoURL || null
    });
  } catch (error) {
    console.error('Error getting user resume:', error);
    res.status(500).json({ message: 'Failed to get resume' });
  }
});

// Add feedback to a resume
router.post('/feedback/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const reviewerId = req.user.uid;
    const { content, parentId } = req.body;
    
    if (!content || content.trim() === '') {
      return res.status(400).json({ message: 'Feedback content is required' });
    }
    
    // Check if the user exists and has a resume
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    if (!userData.resumeURL) {
      return res.status(404).json({ message: 'No resume found for this user' });
    }
    
    // Get reviewer's info
    const reviewerRef = doc(db, 'users', reviewerId);
    const reviewerDoc = await getDoc(reviewerRef);
    
    if (!reviewerDoc.exists()) {
      return res.status(404).json({ message: 'Reviewer not found' });
    }
    
    const reviewerData = reviewerDoc.data();
    
    // Add feedback to the feedback collection
    const feedbackRef = collection(db, 'resumeFeedback');
    const newFeedback = {
      resumeOwnerId: userId,
      reviewerId: reviewerId,
      reviewerName: reviewerData.fullName,
      reviewerPhotoURL: reviewerData.photoURL || null,
      content: content,
      parentId: parentId || null, // Add parentId field for nested comments
      votes: 0, // Initialize votes count
      upvotedBy: [], // Track users who upvoted
      downvotedBy: [], // Track users who downvoted
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const docRef = await addDoc(feedbackRef, newFeedback);
    
    res.status(201).json({
      id: docRef.id,
      ...newFeedback
    });
  } catch (error) {
    console.error('Error adding feedback:', error);
    res.status(500).json({ message: 'Failed to add feedback' });
  }
});

// Get all feedback for a resume
router.get('/feedback/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.uid;
    
    // Query all feedback for this user's resume
    const feedbackRef = collection(db, 'resumeFeedback');
    const q = query(
      feedbackRef,
      where('resumeOwnerId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    
    // Get all feedbacks first
    const allFeedback = [];
    querySnapshot.forEach((doc) => {
      const feedbackData = doc.data();
      // Add info about current user's vote status
      const upvoted = feedbackData.upvotedBy && feedbackData.upvotedBy.includes(currentUserId);
      const downvoted = feedbackData.downvotedBy && feedbackData.downvotedBy.includes(currentUserId);
      
      allFeedback.push({
        id: doc.id,
        ...feedbackData,
        upvoted,
        downvoted
      });
    });
    
    // Organize into a tree structure
    const feedbackMap = {};
    const rootFeedback = [];
    
    // First pass: create a map of all feedback items
    allFeedback.forEach(feedback => {
      // Ensure there's a replies array for each feedback
      feedback.replies = [];
      feedbackMap[feedback.id] = feedback;
    });
    
    // Second pass: organize into parent-child relationships
    allFeedback.forEach(feedback => {
      if (feedback.parentId && feedbackMap[feedback.parentId]) {
        // This is a reply, add it to its parent's replies
        feedbackMap[feedback.parentId].replies.push(feedback);
      } else {
        // This is a top-level comment
        rootFeedback.push(feedback);
      }
    });
    
    // Sort root feedback by created time descending
    rootFeedback.sort((a, b) => {
      return new Date(b.createdAt.seconds * 1000) - new Date(a.createdAt.seconds * 1000);
    });
    
    // Sort replies by created time ascending (oldest first like Reddit)
    const sortReplies = (replies) => {
      replies.sort((a, b) => {
        return new Date(a.createdAt.seconds * 1000) - new Date(b.createdAt.seconds * 1000);
      });
      
      // Recursively sort replies of replies
      replies.forEach(reply => {
        if (reply.replies && reply.replies.length > 0) {
          sortReplies(reply.replies);
        }
      });
    };
    
    rootFeedback.forEach(feedback => {
      if (feedback.replies && feedback.replies.length > 0) {
        sortReplies(feedback.replies);
      }
    });
    
    res.status(200).json(rootFeedback);
  } catch (error) {
    console.error('Error getting feedback:', error);
    res.status(500).json({ message: 'Failed to get feedback' });
  }
});

// Delete feedback (only the author or resume owner can delete)
router.delete('/feedback/:feedbackId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { feedbackId } = req.params;
    const { deleteReplies = true } = req.query; // Option to delete all replies
    
    // Get the feedback
    const feedbackRef = doc(db, 'resumeFeedback', feedbackId);
    const feedbackDoc = await getDoc(feedbackRef);
    
    if (!feedbackDoc.exists()) {
      return res.status(404).json({ message: 'Feedback not found' });
    }
    
    const feedbackData = feedbackDoc.data();
    
    // Check if the user is authorized to delete this feedback
    if (feedbackData.reviewerId !== userId && feedbackData.resumeOwnerId !== userId) {
      return res.status(403).json({ message: 'You are not authorized to delete this feedback' });
    }
    
    // Check for replies to this comment
    const feedbackCollectionRef = collection(db, 'resumeFeedback');
    const repliesQuery = query(
      feedbackCollectionRef, 
      where('parentId', '==', feedbackId)
    );
    const repliesSnapshot = await getDocs(repliesQuery);
    
    // If there are replies and deleteReplies is true, delete them recursively
    if (!repliesSnapshot.empty && deleteReplies === 'true') {
      // Use a batch to delete all replies
      const batch = writeBatch(db);
      
      // Helper function to recursively find and delete all nested replies
      const deleteRepliesRecursively = async (parentId) => {
        const nestedRepliesQuery = query(
          feedbackCollectionRef,
          where('parentId', '==', parentId)
        );
        const nestedRepliesSnapshot = await getDocs(nestedRepliesQuery);
        
        for (const doc of nestedRepliesSnapshot.docs) {
          // Add this reply to the batch for deletion
          batch.delete(doc.ref);
          
          // Recursively find and delete any replies to this reply
          await deleteRepliesRecursively(doc.id);
        }
      };
      
      // Start the recursive deletion process
      for (const doc of repliesSnapshot.docs) {
        batch.delete(doc.ref);
        await deleteRepliesRecursively(doc.id);
      }
      
      // Commit the batch to delete all nested replies
      await batch.commit();
    } 
    // If there are replies but deleteReplies is false, orphan them (make them top-level)
    else if (!repliesSnapshot.empty && deleteReplies !== 'true') {
      const batch = writeBatch(db);
      
      repliesSnapshot.forEach((replyDoc) => {
        // Update each reply to remove the parentId
        batch.update(replyDoc.ref, { parentId: null });
      });
      
      await batch.commit();
    }
    
    // Delete the feedback
    await deleteDoc(feedbackRef);
    
    res.status(200).json({ message: 'Feedback deleted successfully' });
  } catch (error) {
    console.error('Error deleting feedback:', error);
    res.status(500).json({ message: 'Failed to delete feedback' });
  }
});

// Upvote a feedback
router.post('/feedback/:feedbackId/upvote', authMiddleware, async (req, res) => {
  try {
    const { feedbackId } = req.params;
    const userId = req.user.uid;
    
    // Get the feedback
    const feedbackRef = doc(db, 'resumeFeedback', feedbackId);
    const feedbackDoc = await getDoc(feedbackRef);
    
    if (!feedbackDoc.exists()) {
      return res.status(404).json({ message: 'Feedback not found' });
    }
    
    const feedbackData = feedbackDoc.data();
    
    // Check if user already upvoted
    const alreadyUpvoted = feedbackData.upvotedBy && feedbackData.upvotedBy.includes(userId);
    // Check if user already downvoted
    const alreadyDownvoted = feedbackData.downvotedBy && feedbackData.downvotedBy.includes(userId);
    
    let votes = feedbackData.votes || 0;
    let upvotedBy = feedbackData.upvotedBy || [];
    let downvotedBy = feedbackData.downvotedBy || [];
    
    // Handle different scenarios
    if (alreadyUpvoted) {
      // Remove upvote if already upvoted (toggle off)
      votes -= 1;
      upvotedBy = upvotedBy.filter(id => id !== userId);
    } else {
      // Add upvote
      votes += 1;
      upvotedBy.push(userId);
      
      // If previously downvoted, remove downvote
      if (alreadyDownvoted) {
        votes += 1; // +1 more to cancel out the previous downvote
        downvotedBy = downvotedBy.filter(id => id !== userId);
      }
    }
    
    // Update the feedback
    await updateDoc(feedbackRef, {
      votes,
      upvotedBy,
      downvotedBy,
      updatedAt: new Date()
    });
    
    res.status(200).json({ 
      message: alreadyUpvoted ? 'Upvote removed' : 'Feedback upvoted',
      votes,
      upvoted: !alreadyUpvoted
    });
  } catch (error) {
    console.error('Error upvoting feedback:', error);
    res.status(500).json({ message: 'Failed to upvote feedback' });
  }
});

// Downvote a feedback
router.post('/feedback/:feedbackId/downvote', authMiddleware, async (req, res) => {
  try {
    const { feedbackId } = req.params;
    const userId = req.user.uid;
    
    // Get the feedback
    const feedbackRef = doc(db, 'resumeFeedback', feedbackId);
    const feedbackDoc = await getDoc(feedbackRef);
    
    if (!feedbackDoc.exists()) {
      return res.status(404).json({ message: 'Feedback not found' });
    }
    
    const feedbackData = feedbackDoc.data();
    
    // Check if user already downvoted
    const alreadyDownvoted = feedbackData.downvotedBy && feedbackData.downvotedBy.includes(userId);
    // Check if user already upvoted
    const alreadyUpvoted = feedbackData.upvotedBy && feedbackData.upvotedBy.includes(userId);
    
    let votes = feedbackData.votes || 0;
    let downvotedBy = feedbackData.downvotedBy || [];
    let upvotedBy = feedbackData.upvotedBy || [];
    
    // Handle different scenarios
    if (alreadyDownvoted) {
      // Remove downvote if already downvoted (toggle off)
      votes += 1;
      downvotedBy = downvotedBy.filter(id => id !== userId);
    } else {
      // Add downvote
      votes -= 1;
      downvotedBy.push(userId);
      
      // If previously upvoted, remove upvote
      if (alreadyUpvoted) {
        votes -= 1; // -1 more to cancel out the previous upvote
        upvotedBy = upvotedBy.filter(id => id !== userId);
      }
    }
    
    // Update the feedback
    await updateDoc(feedbackRef, {
      votes,
      downvotedBy,
      upvotedBy,
      updatedAt: new Date()
    });
    
    res.status(200).json({ 
      message: alreadyDownvoted ? 'Downvote removed' : 'Feedback downvoted',
      votes,
      downvoted: !alreadyDownvoted
    });
  } catch (error) {
    console.error('Error downvoting feedback:', error);
    res.status(500).json({ message: 'Failed to downvote feedback' });
  }
});

module.exports = router; 