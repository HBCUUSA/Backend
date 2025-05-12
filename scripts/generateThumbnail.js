/**
 * Script to generate thumbnails for existing testimonial videos
 * 
 * Usage:
 * 1. Run this script with: node generateThumbnail.js <testimonialId>
 * 
 * Note: This requires ffmpeg to be installed on your system
 */

const { db, storage } = require('../firebase/config');
const { doc, getDoc, updateDoc } = require('firebase/firestore');
const { ref, uploadBytes, getDownloadURL } = require('firebase/storage');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

// Get testimonial ID from command line arguments
const testimonialId = process.argv[2];

if (!testimonialId) {
  console.error('Please provide a testimonial ID');
  process.exit(1);
}

// Main function
async function generateThumbnail() {
  try {
    console.log(`Generating thumbnail for testimonial: ${testimonialId}`);
    
    // Get the testimonial document
    const testimonialRef = doc(db, "testimonials", testimonialId);
    const testimonialDoc = await getDoc(testimonialRef);
    
    if (!testimonialDoc.exists()) {
      console.error('Testimonial not found');
      process.exit(1);
    }
    
    const testimonialData = testimonialDoc.data();
    const videoUrl = testimonialData.videoUrl;
    
    if (!videoUrl) {
      console.error('Video URL not found in testimonial data');
      process.exit(1);
    }
    
    // Create a temporary directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbnail-'));
    const tempVideoPath = path.join(tempDir, 'video.mp4');
    const tempThumbnailPath = path.join(tempDir, 'thumbnail.jpg');
    
    console.log('Downloading video...');
    
    // Download the video
    const response = await fetch(videoUrl);
    const videoBuffer = await response.arrayBuffer();
    fs.writeFileSync(tempVideoPath, Buffer.from(videoBuffer));
    
    console.log('Extracting thumbnail...');
    
    // Use ffmpeg to extract a thumbnail at 1 second
    await new Promise((resolve, reject) => {
      exec(`ffmpeg -i "${tempVideoPath}" -ss 00:00:01 -vframes 1 "${tempThumbnailPath}"`, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    
    if (!fs.existsSync(tempThumbnailPath)) {
      console.error('Failed to generate thumbnail');
      process.exit(1);
    }
    
    console.log('Uploading thumbnail to Firebase Storage...');
    
    // Upload thumbnail to Firebase Storage
    const timestamp = Date.now();
    const thumbnailFileName = `testimonials/thumbnails/${timestamp}_${testimonialId}.jpg`;
    const thumbnailRef = ref(storage, thumbnailFileName);
    
    // Read the thumbnail file
    const thumbnailBuffer = fs.readFileSync(tempThumbnailPath);
    
    // Create file metadata
    const metadata = {
      contentType: 'image/jpeg',
    };
    
    // Upload the thumbnail
    await uploadBytes(thumbnailRef, thumbnailBuffer, metadata);
    
    // Get the download URL
    const thumbnailUrl = await getDownloadURL(thumbnailRef);
    
    console.log('Thumbnail uploaded successfully');
    console.log('Thumbnail URL:', thumbnailUrl);
    
    // Update the testimonial document with the thumbnail URL
    await updateDoc(testimonialRef, {
      thumbnailUrl: thumbnailUrl
    });
    
    console.log('Testimonial updated with thumbnail URL');
    
    // Clean up temporary files
    fs.rmSync(tempDir, { recursive: true, force: true });
    
  } catch (error) {
    console.error('Error generating thumbnail:', error);
  }
}

// Run the function
generateThumbnail(); 