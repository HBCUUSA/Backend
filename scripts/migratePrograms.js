const fs = require('fs');
const path = require('path');
const { db } = require('../firebase/config');
const { collection, addDoc } = require('firebase/firestore');

async function migratePrograms() {
  try {
    // Read the JSON file
    const programsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../frontend/public/img/program.json'), 'utf8')
    );
    
    console.log(`Found ${programsData.length} programs to migrate`);
    
    const programsCollection = collection(db, 'programs');
    let successCount = 0;
    
    // Add each program to Firestore
    for (const program of programsData) {
      try {
        await addDoc(programsCollection, {
          name: program.name,
          description: program.description || "",
          applicationMonth: program.applicationMonth,
          applicationLink: program.applicationLink,
          logo: program.logo || "",
          createdAt: new Date()
        });
        console.log(`Added program: ${program.name}`);
        successCount++;
      } catch (err) {
        console.error(`Failed to add program ${program.name}:`, err);
      }
    }
    
    console.log(`Migration completed! Successfully added ${successCount} out of ${programsData.length} programs.`);
  } catch (error) {
    console.error('Error migrating programs:', error);
  }
}

migratePrograms(); 