const express = require('express');
     const cors = require('cors');
     const bodyParser = require('body-parser');
     const { exec } = require('child_process');
     const fs = require('fs').promises;
     const path = require('path');

     const app = express();
     const port = process.env.PORT || 5000; // Heroku port

     // Middleware
     app.use(cors());
     app.use(bodyParser.json());

     // Serve static files from public folder
     app.use(express.static(path.join(__dirname, 'public')));

     // Temporary directory for storing sketches
     const tempDir = path.join(__dirname, 'temp');

     // Create temp directory if it doesn't exist
     async function ensureTempDir() {
       try {
         await fs.mkdir(tempDir, { recursive: true });
       } catch (error) {
         console.error('Error creating temp directory:', error);
       }
     }
     ensureTempDir();

     // Compile and Upload function
     async function compileSketch(code, board, sketchName) {
       const sketchDir = path.join(tempDir, sketchName);
       const filePath = path.join(sketchDir, `${sketchName}.ino`);

       try {
         // Create sketch directory
         await fs.mkdir(sketchDir, { recursive: true });

         // Write code to .ino file
         await fs.writeFile(filePath, code);

         // Arduino CLI compile command
         const compileCommand = `arduino-cli compile --fqbn ${board} "${sketchDir}"`;

         return new Promise((resolve, reject) => {
           exec(compileCommand, (error, stdout, stderr) => {
             if (error || stderr) {
               reject({ error: 'Compilation failed', details: stderr || error.message });
             } else {
               resolve({ message: 'Compilation successful', output: stdout, sketchDir });
             }
           });
         });
       } catch (error) {
         throw { error: 'Compilation failed', details: error.message };
       }
     }

     // Compile endpoint
     app.post('/compile', async (req, res) => {
       const { code, board } = req.body;

       if (!code || !board) {
         return res.status(400).json({ error: 'Code and board are required' });
       }

       const sketchName = `sketch_${Date.now()}`;

       try {
         const result = await compileSketch(code, board, sketchName);
         res.json(result);

         // Clean up
         await fs.rm(path.join(tempDir, sketchName), { recursive: true, force: true });
       } catch (error) {
         res.status(500).json(error);

         // Clean up on error
         await fs.rm(path.join(tempDir, sketchName), { recursive: true, force: true }).catch((err) => {
           console.error('Error cleaning up:', err);
         });
       }
     });

     // Upload endpoint
     app.post('/upload', async (req, res) => {
       const { code, board, port } = req.body;

       if (!code || !board || !port) {
         return res.status(400).json({ error: 'Code, board, and port are required' });
       }

       // Validate port format
       const portRegex = /^COM\d+$|^\/dev\/tty(USB|ACM)\d+$/;
       if (!portRegex.test(port)) {
         return res.status(400).json({ error: 'Invalid port format', details: `Port ${port} is not valid. Use format COM7 or /dev/ttyUSB0.` });
       }

       const sketchName = `sketch_${Date.now()}`;

       try {
         // Compile the sketch first
         const compileResult = await compileSketch(code, board, sketchName);
         const sketchDir = compileResult.sketchDir;

         // Arduino CLI upload command
         const uploadCommand = `arduino-cli upload -p ${port} --fqbn ${board} "${sketchDir}"`;

         // Execute upload command
         exec(uploadCommand, async (error, stdout, stderr) => {
           if (error || stderr) {
             console.error('Upload error:', stderr || error.message);
             res.status(500).json({ error: 'Upload failed', details: stderr || error.message });
           } else {
             res.json({ message: 'Upload successful', output: stdout });
           }

           // Clean up
           await fs.rm(sketchDir, { recursive: true, force: true }).catch((err) => {
             console.error('Error cleaning up:', err);
           });
         });
       } catch (error) {
         console.error('Error during upload process:', error);
         res.status(500).json(error);

         // Clean up on error
         await fs.rm(path.join(tempDir, sketchName), { recursive: true, force: true }).catch((err) => {
           console.error('Error cleaning up:', err);
         });
       }
     });

     // Serve frontend for all other routes
     app.get('*', (req, res) => {
       res.sendFile(path.join(__dirname, 'public', 'index.html'));
     });

     // Start server
     app.listen(port, () => {
       console.log(`Server running at http://localhost:${port}`);
     });