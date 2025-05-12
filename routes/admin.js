const express = require('express');
const router = express.Router();
const { db } = require('../firebase/config');
const { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter, 
  serverTimestamp, 
  addDoc 
} = require('firebase/firestore');
const authMiddleware = require('../middleware/auth');

// Admin authorization middleware
const adminAuthMiddleware = (req, res, next) => {
  // Check if user is admin
  const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS 
    ? process.env.ADMIN_USER_IDS.split(',') 
    : ['FwIvYUynY6anohhwr6C3LSvqs4V2']; // Default admin ID
  
  if (!req.user || !ADMIN_USER_IDS.includes(req.user.uid)) {
    return res.status(403).json({ message: 'Access denied: Admin privileges required' });
  }
  
  next();
};

// Protect all admin routes
router.use(authMiddleware);
router.use(adminAuthMiddleware);

// Get all contributions with pagination
router.get('/contributions', async (req, res) => {
  try {
    const { status = 'all', limit: pageSize = 10, lastId } = req.query;
    const pageLimit = parseInt(pageSize);
    
    let contributionsQuery;
    let snapshot;
    let contributions = [];
    
    try {
      // Try to execute the query with ordering
      if (status !== 'all') {
        contributionsQuery = query(
          collection(db, "programstd"),
          where("status", "==", status),
          orderBy("createdAt", "desc"),
          limit(pageLimit)
        );
      } else {
        contributionsQuery = query(
          collection(db, "programstd"),
          orderBy("createdAt", "desc"),
          limit(pageLimit)
        );
      }
      
      // If we have a lastId, start after that document
      if (lastId) {
        const lastDocRef = doc(db, "programstd", lastId);
        const lastDoc = await getDoc(lastDocRef);
        
        if (lastDoc.exists()) {
          if (status !== 'all') {
            contributionsQuery = query(
              collection(db, "programstd"),
              where("status", "==", status),
              orderBy("createdAt", "desc"),
              startAfter(lastDoc),
              limit(pageLimit)
            );
          } else {
            contributionsQuery = query(
              collection(db, "programstd"),
              orderBy("createdAt", "desc"),
              startAfter(lastDoc),
              limit(pageLimit)
            );
          }
        }
      }
      
      snapshot = await getDocs(contributionsQuery);
    } catch (indexError) {
      // If we get an index error, fall back to a simpler query
      if (indexError.code === 'failed-precondition') {
        console.log('Index error, falling back to unordered query');
        
        // Fallback query without complex ordering
        if (status !== 'all') {
          contributionsQuery = query(
            collection(db, "programstd"),
            where("status", "==", status)
          );
        } else {
          contributionsQuery = query(
            collection(db, "programstd")
          );
        }
        
        snapshot = await getDocs(contributionsQuery);
      } else {
        // If it's not an index error, rethrow
        throw indexError;
      }
    }
    
    snapshot.forEach(doc => {
      contributions.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || null
      });
    });
    
    // If we had to use the fallback query, sort and limit in memory
    if (contributions.length > pageLimit) {
      // Sort by createdAt in descending order
      contributions.sort((a, b) => {
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return b.createdAt - a.createdAt;
      });
      
      // Apply pagination in memory
      if (lastId) {
        const lastIndex = contributions.findIndex(c => c.id === lastId);
        if (lastIndex !== -1) {
          contributions = contributions.slice(lastIndex + 1, lastIndex + 1 + pageLimit);
        } else {
          contributions = contributions.slice(0, pageLimit);
        }
      } else {
        contributions = contributions.slice(0, pageLimit);
      }
    }
    
    // Get total count for the status
    let totalCount = 0;
    if (status !== 'all') {
      const countQuery = query(
        collection(db, "programstd"),
        where("status", "==", status)
      );
      const countSnapshot = await getDocs(countQuery);
      totalCount = countSnapshot.size;
    } else {
      const countQuery = collection(db, "programstd");
      const countSnapshot = await getDocs(countQuery);
      totalCount = countSnapshot.size;
    }
    
    // Check if there are more results
    const hasMore = contributions.length === pageLimit && totalCount > pageLimit;
    
    res.status(200).json({
      contributions,
      pagination: {
        hasMore,
        totalCount,
        lastId: contributions.length > 0 ? contributions[contributions.length - 1].id : null
      }
    });
  } catch (error) {
    console.error('Error fetching contributions:', error);
    
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

// Get contribution details
router.get('/contributions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const contributionRef = doc(db, "programstd", id);
    const contributionDoc = await getDoc(contributionRef);
    
    if (!contributionDoc.exists()) {
      return res.status(404).json({ message: 'Contribution not found' });
    }
    
    const contributionData = {
      id: contributionDoc.id,
      ...contributionDoc.data(),
      createdAt: contributionDoc.data().createdAt?.toDate() || null
    };
    
    res.status(200).json(contributionData);
  } catch (error) {
    console.error('Error fetching contribution details:', error);
    res.status(500).json({ message: 'Failed to fetch contribution details' });
  }
});

// Update contribution status
router.put('/contributions/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, applicationMonth, reason } = req.body;
    
    // Validate the status
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }
    
    // Get the contribution document
    const contributionRef = doc(db, "programstd", id);
    const contributionDoc = await getDoc(contributionRef);
    
    if (!contributionDoc.exists()) {
      return res.status(404).json({ message: 'Contribution not found' });
    }
    
    const contributionData = contributionDoc.data();
    
    // Prepare update data
    const updateData = {
      status,
      updatedAt: serverTimestamp(),
      updatedBy: req.user.uid
    };
    
    // Add status-specific fields
    if (status === 'approved') {
      if (!applicationMonth) {
        return res.status(400).json({ message: 'Application month is required for approval' });
      }
      
      updateData.approvedAt = serverTimestamp();
      updateData.approvedBy = req.user.uid;
      updateData.applicationMonth = applicationMonth;
    } else if (status === 'rejected') {
      if (!reason) {
        return res.status(400).json({ message: 'Rejection reason is required' });
      }
      
      updateData.rejectedAt = serverTimestamp();
      updateData.rejectedBy = req.user.uid;
      updateData.rejectionReason = reason;
    }
    
    // Update the contribution status
    await updateDoc(contributionRef, updateData);
    
    // If approved, add to programs collection
    if (status === 'approved') {
      await addDoc(collection(db, "programs"), {
        name: contributionData.name,
        applicationLink: contributionData.website,
        description: contributionData.description || "",
        applicationMonth: applicationMonth,
        logo: "",
        createdAt: serverTimestamp(),
        contributedBy: contributionData.userId,
        contributionId: id
      });
    }
    
    res.status(200).json({ 
      message: `Contribution ${status === 'approved' ? 'approved and added to programs' : status === 'rejected' ? 'rejected' : 'updated'}` 
    });
  } catch (error) {
    console.error('Error updating contribution status:', error);
    res.status(500).json({ message: 'Failed to update contribution status' });
  }
});

// Delete a contribution
router.delete('/contributions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const contributionRef = doc(db, "programstd", id);
    
    const contributionDoc = await getDoc(contributionRef);
    if (!contributionDoc.exists()) {
      return res.status(404).json({ message: 'Contribution not found' });
    }
    
    await deleteDoc(contributionRef);
    
    res.status(200).json({ message: 'Contribution deleted successfully' });
  } catch (error) {
    console.error('Error deleting contribution:', error);
    res.status(500).json({ message: 'Failed to delete contribution' });
  }
});

// Get admin dashboard statistics
router.get('/dashboard-stats', async (req, res) => {
  try {
    // Get pending contributions count
    const pendingQuery = query(
      collection(db, "programstd"),
      where("status", "==", "pending")
    );
    const pendingSnapshot = await getDocs(pendingQuery);
    const pendingCount = pendingSnapshot.size;
    
    // Get approved contributions count
    const approvedQuery = query(
      collection(db, "programstd"),
      where("status", "==", "approved")
    );
    const approvedSnapshot = await getDocs(approvedQuery);
    const approvedCount = approvedSnapshot.size;
    
    // Get rejected contributions count
    const rejectedQuery = query(
      collection(db, "programstd"),
      where("status", "==", "rejected")
    );
    const rejectedSnapshot = await getDocs(rejectedQuery);
    const rejectedCount = rejectedSnapshot.size;
    
    // Get total programs count
    const programsQuery = collection(db, "programs");
    const programsSnapshot = await getDocs(programsQuery);
    const programsCount = programsSnapshot.size;
    
    // Get recent contributions
    const recentQuery = query(
      collection(db, "programstd"),
      orderBy("createdAt", "desc"),
      limit(5)
    );
    const recentSnapshot = await getDocs(recentQuery);
    const recentContributions = [];
    recentSnapshot.forEach(doc => {
      recentContributions.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || null
      });
    });
    
    res.status(200).json({
      stats: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        totalPrograms: programsCount
      },
      recentContributions
    });
  } catch (error) {
    console.error('Error fetching admin dashboard stats:', error);
    res.status(500).json({ message: 'Failed to fetch dashboard statistics' });
  }
});

module.exports = router; 