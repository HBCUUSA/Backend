/**
 * Script to manually add testimonials to Firebase
 * 
 * Usage:
 * 1. Place your video files in a directory
 * 2. Update the videoPath variable below
 * 3. Run this script with: node addTestimonial.js
 */

const { db, storage } = require('../firebase/config');
const { collection, addDoc, serverTimestamp } = require('firebase/firestore');
const { ref, uploadBytes, getDownloadURL } = require('firebase/storage');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to prompt for input
const prompt = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
};

// Main function
async function addTestimonial() {
  try {
    console.log('=== Add New Testimonial ===');
    
    // Get testimonial details from user input
    const title = await prompt('Enter testimonial title: ');
    const programName = await prompt('Enter program name (optional): ');
    const description = await prompt('Enter description (optional): ');
    const videoPath = await prompt('Enter path to video file: ');
    
    // Resolve the path - handle both absolute and relative paths
    const resolvedPath = path.resolve(process.cwd(), videoPath);
    
    console.log(`Checking if file exists at: ${resolvedPath}`);
    if (fs.existsSync(resolvedPath)) {
      console.log('File found successfully');
    } else {
      console.error(`File not found at path: ${resolvedPath}`);
      console.log('Current working directory:', process.cwd());
      return;
    }
    
    if (!title) {
      console.error('Title is required');
      return;
    }
    
    // Read the video file
    const videoBuffer = fs.readFileSync(resolvedPath);
    const videoFileName = path.basename(resolvedPath);
    
    // Upload video to Firebase Storage
    const timestamp = Date.now();
    const storageFileName = `testimonials/videos/${timestamp}_${videoFileName}`;
    const storageRef = ref(storage, storageFileName);
    
    console.log('Uploading video to Firebase Storage...');
    
    // Create file metadata
    const metadata = {
      contentType: 'video/mp4', // Adjust if needed
    };
    
    // Upload the file
    await uploadBytes(storageRef, videoBuffer, metadata);
    
    // Get the download URL
    const videoUrl = await getDownloadURL(storageRef);
    
    console.log('Video uploaded successfully');
    console.log('Video URL:', videoUrl);
    
    // Add testimonial to Firestore
    const testimonialData = {
      title,
      programName: programName || "",
      description: description || "",
      videoUrl,
      thumbnailUrl: "/img/default-thumbnail.jpg", // Use a default thumbnail
      videoPath: storageFileName, // Store the file path for future reference
      createdAt: serverTimestamp()
    };
    
    console.log('Adding testimonial to Firestore...');
    
    const docRef = await addDoc(collection(db, "testimonials"), testimonialData);
    
    console.log('Testimonial added successfully');
    console.log('Testimonial ID:', docRef.id);
    
  } catch (error) {
    console.error('Error adding testimonial:', error);
  } finally {
    rl.close();
  }
}

// Run the function
addTestimonial();