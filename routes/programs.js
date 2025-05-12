const express = require('express');
const router = express.Router();
const { db } = require('../firebase/config');
const { collection, getDocs, query, where, orderBy } = require('firebase/firestore');
const authMiddleware = require('../middleware/auth');

// Get all programs
router.get('/', async (req, res) => {
  try {
    const programsCollection = collection(db, 'programs');
    const programsSnapshot = await getDocs(programsCollection);
    
    const programs = [];
    programsSnapshot.forEach(doc => {
      programs.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    res.status(200).json(programs);
  } catch (error) {
    console.error('Error fetching programs:', error);
    res.status(500).json({ message: 'Failed to fetch programs' });
  }
});

// Get programs with filters
router.get('/filter', async (req, res) => {
  try {
    const { search, month } = req.query;
    
    let programsQuery = collection(db, 'programs');
    
    // Apply filters if provided
    if (search || month) {
      // Note: Firestore doesn't support case-insensitive search directly
      // For a real app, you might want to use a more sophisticated search solution
      
      // For this example, we'll fetch all and filter in memory
      const snapshot = await getDocs(programsQuery);
      
      let programs = [];
      snapshot.forEach(doc => {
        programs.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      // Apply filters
      if (search) {
        const searchLower = search.toLowerCase();
        programs = programs.filter(program => 
          program.name.toLowerCase().includes(searchLower)
        );
      }
      
      if (month) {
        const monthLower = month.toLowerCase();
        programs = programs.filter(program => 
          program.applicationMonth.toLowerCase().includes(monthLower)
        );
      }
      
      return res.status(200).json(programs);
    }
    
    // If no filters, return all programs
    const snapshot = await getDocs(programsQuery);
    
    const programs = [];
    snapshot.forEach(doc => {
      programs.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    res.status(200).json(programs);
  } catch (error) {
    console.error('Error fetching filtered programs:', error);
    res.status(500).json({ message: 'Failed to fetch programs' });
  }
});

// Get a specific program by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const programDoc = await getDoc(doc(db, 'programs', id));
    
    if (!programDoc.exists()) {
      return res.status(404).json({ message: 'Program not found' });
    }
    
    res.status(200).json({
      id: programDoc.id,
      ...programDoc.data()
    });
  } catch (error) {
    console.error('Error fetching program:', error);
    res.status(500).json({ message: 'Failed to fetch program' });
  }
});

module.exports = router; 