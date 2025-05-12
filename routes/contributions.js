const express = require('express');
const router = express.Router();
const { db } = require('../firebase/config');
const { collection, addDoc, serverTimestamp, getDocs, doc, updateDoc, deleteDoc, query, where, orderBy } = require('firebase/firestore');
const authMiddleware = require('../middleware/auth');

// Submit a new program contribution
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, website, description } = req.body;
    
    // Validate required fields
    if (!name || !website) {
      return res.status(400).json({ message: 'Program name and website are required' });
    }
    
    // Create a new document in the "programstd" collection
    const contributionData = {
      name,
      website,
      description: description || "",
      userId: req.user.uid,
      userEmail: req.user.email,
      userDisplayName: req.user.displayName || "Anonymous",
      createdAt: serverTimestamp(),
      status: "pending" // For moderation purposes
    };
    
    const docRef = await addDoc(collection(db, "programstd"), contributionData);
    
    res.status(201).json({ 
      id: docRef.id,
      message: "Contribution submitted successfully and pending review"
    });
  } catch (error) {
    console.error('Error submitting contribution:', error);
    res.status(500).json({ message: 'Failed to submit contribution' });
  }
});

// Get all contributions for the current user
router.get('/my-contributions', authMiddleware, async (req, res) => {
  try {
    // Try to execute the query with ordering
    try {
      const contributionsQuery = query(
        collection(db, "programstd"),
        where("userId", "==", req.user.uid),
        orderBy("createdAt", "desc")
      );
      
      const snapshot = await getDocs(contributionsQuery);
      
      const contributions = [];
      snapshot.forEach(doc => {
        contributions.push({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || null
        });
      });
      
      return res.status(200).json(contributions);
    } catch (indexError) {
      // If we get an index error, fall back to a simpler query without ordering
      if (indexError.code === 'failed-precondition') {
        console.log('Index error, falling back to unordered query');
        
        // Fallback query without ordering
        const fallbackQuery = query(
          collection(db, "programstd"),
          where("userId", "==", req.user.uid)
        );
        
        const snapshot = await getDocs(fallbackQuery);
        
        const contributions = [];
        snapshot.forEach(doc => {
          contributions.push({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate() || null
          });
        });
        
        // Sort the results in memory
        contributions.sort((a, b) => {
          if (!a.createdAt) return 1;
          if (!b.createdAt) return -1;
          return b.createdAt - a.createdAt;
        });
        
        return res.status(200).json(contributions);
      } else {
        // If it's not an index error, rethrow
        throw indexError;
      }
    }
  } catch (error) {
    console.error("Error fetching user contributions:", error);
    
    // Provide helpful error message with index creation link
    if (error.code === 'failed-precondition' && error.message.includes('index')) {
      const indexUrl = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
      return res.status(500).json({ 
        message: 'Database index required. Please contact the administrator with this information.',
        indexUrl: indexUrl ? indexUrl[0] : null
      });
    }
    
    res.status(500).json({ message: 'Failed to fetch contributions' });
  }
});

// Admin routes
// Get all pending contributions (admin only)
router.get('/admin/pending', authMiddleware, async (req, res) => {
  // Check if user is admin
  if (!req.user.isAdmin) {
    return res.status(403).json({ message: 'Access denied: Admin privileges required' });
  }
  
  try {
    const pendingQuery = query(
      collection(db, "programstd"),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );
    
    const snapshot = await getDocs(pendingQuery);
    
    const pendingContributions = [];
    snapshot.forEach(doc => {
      pendingContributions.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || null
      });
    });
    
    res.status(200).json(pendingContributions);
  } catch (error) {
    console.error('Error fetching pending contributions:', error);
    res.status(500).json({ message: 'Failed to fetch pending contributions' });
  }
});

// Approve a contribution (admin only)
router.put('/admin/approve/:id', authMiddleware, async (req, res) => {
  // Check if user is admin
  if (!req.user.isAdmin) {
    return res.status(403).json({ message: 'Access denied: Admin privileges required' });
  }
  
  try {
    const { id } = req.params;
    
    // Update the contribution status
    const contributionRef = doc(db, "programstd", id);
    await updateDoc(contributionRef, {
      status: "approved",
      approvedAt: serverTimestamp(),
      approvedBy: req.user.uid
    });
    
    // Get the approved contribution data
    const contributionDoc = await getDoc(contributionRef);
    if (!contributionDoc.exists()) {
      return res.status(404).json({ message: 'Contribution not found' });
    }
    
    const contributionData = contributionDoc.data();
    
    // Add to the main programs collection
    await addDoc(collection(db, "programs"), {
      name: contributionData.name,
      applicationLink: contributionData.website,
      description: contributionData.description || "",
      applicationMonth: req.body.applicationMonth || "Unknown", // Admin can set this during approval
      logo: req.body.logo || "",
      createdAt: serverTimestamp(),
      contributedBy: contributionData.userId,
      contributionId: id
    });
    
    res.status(200).json({ message: 'Contribution approved and added to programs' });
  } catch (error) {
    console.error('Error approving contribution:', error);
    res.status(500).json({ message: 'Failed to approve contribution' });
  }
});

// Reject a contribution (admin only)
router.put('/admin/reject/:id', authMiddleware, async (req, res) => {
  // Check if user is admin
  if (!req.user.isAdmin) {
    return res.status(403).json({ message: 'Access denied: Admin privileges required' });
  }
  
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    // Update the contribution status
    const contributionRef = doc(db, "programstd", id);
    await updateDoc(contributionRef, {
      status: "rejected",
      rejectedAt: serverTimestamp(),
      rejectedBy: req.user.uid,
      rejectionReason: reason || "Does not meet our criteria"
    });
    
    res.status(200).json({ message: 'Contribution rejected' });
  } catch (error) {
    console.error('Error rejecting contribution:', error);
    res.status(500).json({ message: 'Failed to reject contribution' });
  }
});

module.exports = router; 