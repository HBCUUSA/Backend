const fs = require('fs');
const path = require('path');
const { db } = require('../firebase/config');
const { collection, getDocs, doc, updateDoc, addDoc } = require('firebase/firestore');

async function updatePrograms() {
  try {
    // Read the JSON file
    const programsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../frontend/public/img/program.json'), 'utf8')
    );
    
    console.log(`Found ${programsData.length} programs to process`);
    
    const programsCollection = collection(db, 'programs');
    let successCount = 0;

    // Fetch all existing programs and map them by name
    const existingProgramsSnapshot = await getDocs(programsCollection);
    const existingProgramsMap = new Map();
    existingProgramsSnapshot.forEach(doc => {
      const data = doc.data();
      existingProgramsMap.set(data.name, { id: doc.id, data });
    });

    for (const program of programsData) {
      try {
        const existingProgram = existingProgramsMap.get(program.name);

        if (existingProgram) {
          // Compare existing data with new data
          const { id, data } = existingProgram;
          const hasChanges = (
            data.description !== (program.description || "") ||
            data.applicationMonth !== program.applicationMonth ||
            data.applicationLink !== program.applicationLink ||
            data.logo !== (program.logo || "")
          );

          if (hasChanges) {
            // Update existing document
            const docRef = doc(programsCollection, id);
            await updateDoc(docRef, {
              description: program.description || "",
              applicationMonth: program.applicationMonth,
              applicationLink: program.applicationLink,
              logo: program.logo || "",
              updatedAt: new Date()
            });
            console.log(`Updated program: ${program.name}`);
          } else {
            console.log(`No changes for program: ${program.name}`);
          }
        } else {
          // Add new document
          await addDoc(programsCollection, {
            name: program.name,
            description: program.description || "",
            applicationMonth: program.applicationMonth,
            applicationLink: program.applicationLink,
            logo: program.logo || "",
            createdAt: new Date()
          });
          console.log(`Added new program: ${program.name}`);
        }
        successCount++;
      } catch (err) {
        console.error(`Failed to process program ${program.name}:`, err);
      }
    }
    
    console.log(`Processing completed! Successfully processed ${successCount} out of ${programsData.length} programs.`);
  } catch (error) {
    console.error('Error processing programs:', error);
  }
}

updatePrograms(); 