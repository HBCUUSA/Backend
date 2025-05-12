const express = require('express');
const router = express.Router();
const { db, storage } = require('../firebase/config');
const { 
  collection, 
  getDocs, 
  addDoc, 
  doc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  limit, 
  startAfter, 
  serverTimestamp 
} = require('firebase/firestore');
const { ref, uploadBytes, getDownloadURL, deleteObject } = require('firebase/storage');
const authMiddleware = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// Get all testimonials with pagination
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit: pageSize = 6 } = req.query;
    const pageLimit = parseInt(pageSize);
    const offset = (parseInt(page) - 1) * pageLimit;
    
    // Get all testimonials ordered by creation date
    const testimonialsQuery = query(
      collection(db, "testimonials"),
      orderBy("createdAt", "desc")
    );
    
    const snapshot = await getDocs(testimonialsQuery);
    
    const testimonials = [];
    snapshot.forEach(doc => {
      testimonials.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || null
      });
    });
    
    // Apply pagination in memory
    const paginatedTestimonials = testimonials.slice(offset, offset + pageLimit);
    const totalCount = testimonials.length;
    const totalPages = Math.ceil(totalCount / pageLimit);
    
    res.status(200).json({
      testimonials: paginatedTestimonials,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalCount,
        hasMore: parseInt(page) < totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching testimonials:', error);
    res.status(500).json({ message: 'Failed to fetch testimonials' });
  }
});

// Get a single testimonial by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const testimonialRef = doc(db, "testimonials", id);
    const testimonialDoc = await getDoc(testimonialRef);
    
    if (!testimonialDoc.exists()) {
      return res.status(404).json({ message: 'Testimonial not found' });
    }
    
    const testimonial = {
      id: testimonialDoc.id,
      ...testimonialDoc.data(),
      createdAt: testimonialDoc.data().createdAt?.toDate() || null
    };
    
    res.status(200).json(testimonial);
  } catch (error) {
    console.error('Error fetching testimonial:', error);
    res.status(500).json({ message: 'Failed to fetch testimonial' });
  }
});

// Add a new testimonial (admin only)
router.post('/', authMiddleware, upload.single('video'), async (req, res) => {
  try {
    // Check if user is admin (you can use your admin middleware here)
    const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS 
      ? process.env.ADMIN_USER_IDS.split(',') 
      : ['FwIvYUynY6anohhwr6C3LSvqs4V2']; // Default admin ID
    
    if (!req.user || !ADMIN_USER_IDS.includes(req.user.uid)) {
      return res.status(403).json({ message: 'Access denied: Admin privileges required' });
    }
    
    const { title, description, programName } = req.body;
    
    if (!title || !req.file) {
      return res.status(400).json({ message: 'Title and video file are required' });
    }
    
    // Upload video to Firebase Storage
    const timestamp = Date.now();
    const fileName = `testimonials/${timestamp}_${req.file.originalname}`;
    const storageRef = ref(storage, fileName);
    
    // Create file metadata
    const metadata = {
      contentType: req.file.mimetype,
    };
    
    // Upload the file
    await uploadBytes(storageRef, req.file.buffer, metadata);
    
    // Get the download URL
    const videoUrl = await getDownloadURL(storageRef);
    
    // Generate a thumbnail URL (you might want to implement a proper thumbnail generation)
    const thumbnailUrl = `/img/default-thumbnail.jpg`;
    
    // Add testimonial to Firestore
    const testimonialData = {
      title,
      description: description || "",
      programName: programName || "",
      videoUrl,
      thumbnailUrl,
      fileName, // Store the file path for future reference
      createdAt: serverTimestamp(),
      createdBy: req.user.uid
    };
    
    const docRef = await addDoc(collection(db, "testimonials"), testimonialData);
    
    res.status(201).json({
      id: docRef.id,
      ...testimonialData
    });
  } catch (error) {
    console.error('Error adding testimonial:', error);
    res.status(500).json({ message: 'Failed to add testimonial' });
  }
});

// Update a testimonial (admin only)
router.put('/:id', authMiddleware, upload.single('video'), async (req, res) => {
  try {
    // Check if user is admin
    const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS 
      ? process.env.ADMIN_USER_IDS.split(',') 
      : ['FwIvYUynY6anohhwr6C3LSvqs4V2']; // Default admin ID
    
    if (!req.user || !ADMIN_USER_IDS.includes(req.user.uid)) {
      return res.status(403).json({ message: 'Access denied: Admin privileges required' });
    }
    
    const { id } = req.params;
    const { title, description, programName } = req.body;
    
    // Get the existing testimonial
    const testimonialRef = doc(db, "testimonials", id);
    const testimonialDoc = await getDoc(testimonialRef);
    
    if (!testimonialDoc.exists()) {
      return res.status(404).json({ message: 'Testimonial not found' });
    }
    
    const testimonialData = testimonialDoc.data();
    
    // Prepare update data
    const updateData = {
      title: title || testimonialData.title,
      description: description !== undefined ? description : testimonialData.description,
      programName: programName !== undefined ? programName : testimonialData.programName,
      updatedAt: serverTimestamp(),
      updatedBy: req.user.uid
    };
    
    // If a new video is uploaded, update the video URL
    if (req.file) {
      // Delete the old video if it exists
      if (testimonialData.fileName) {
        const oldFileRef = ref(storage, testimonialData.fileName);
        try {
          await deleteObject(oldFileRef);
        } catch (deleteError) {
          console.error('Error deleting old video:', deleteError);
          // Continue even if delete fails
        }
      }
      
      // Upload the new video
      const timestamp = Date.now();
      const fileName = `testimonials/${timestamp}_${req.file.originalname}`;
      const storageRef = ref(storage, fileName);
      
      // Create file metadata
      const metadata = {
        contentType: req.file.mimetype,
      };
      
      // Upload the file
      await uploadBytes(storageRef, req.file.buffer, metadata);
      
      // Get the download URL
      const videoUrl = await getDownloadURL(storageRef);
      
      // Update the testimonial data
      updateData.videoUrl = videoUrl;
      updateData.fileName = fileName;
    }
    
    // Update the testimonial
    await updateDoc(testimonialRef, updateData);
    
    res.status(200).json({
      id,
      ...testimonialData,
      ...updateData
    });
  } catch (error) {
    console.error('Error updating testimonial:', error);
    res.status(500).json({ message: 'Failed to update testimonial' });
  }
});

// Delete a testimonial (admin only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS 
      ? process.env.ADMIN_USER_IDS.split(',') 
      : ['FwIvYUynY6anohhwr6C3LSvqs4V2']; // Default admin ID
    
    if (!req.user || !ADMIN_USER_IDS.includes(req.user.uid)) {
      return res.status(403).json({ message: 'Access denied: Admin privileges required' });
    }
    
    const { id } = req.params;
    
    // Get the testimonial to get the file path
    const testimonialRef = doc(db, "testimonials", id);
    const testimonialDoc = await getDoc(testimonialRef);
    
    if (!testimonialDoc.exists()) {
      return res.status(404).json({ message: 'Testimonial not found' });
    }
    
    const testimonialData = testimonialDoc.data();
    
    // Delete the video from storage if it exists
    if (testimonialData.fileName) {
      const fileRef = ref(storage, testimonialData.fileName);
      try {
        await deleteObject(fileRef);
      } catch (deleteError) {
        console.error('Error deleting video:', deleteError);
        // Continue even if delete fails
      }
    }
    
    // Delete the testimonial from Firestore
    await deleteDoc(testimonialRef);
    
    res.status(200).json({ message: 'Testimonial deleted successfully' });
  } catch (error) {
    console.error('Error deleting testimonial:', error);
    res.status(500).json({ message: 'Failed to delete testimonial' });
  }
});

module.exports = router; 