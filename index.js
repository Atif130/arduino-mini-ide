const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const tempDir = path.join(__dirname, 'temp');

async function ensureTempDir() {
  try {
    await fs.mkdir(tempDir, { recursive: true });
  } catch (error) {
    console.error('Error creating temp directory:', error);
  }
}
ensureTempDir();

async function compileSketch(code, board, sketchName) {
  const sketchDir = path.join(tempDir, sketchName);
  const filePath = path.join(sketchDir, `${sketchName}.ino`);
  try {
    await fs.mkdir(sketchDir, { recursive: true });
    await fs.writeFile(filePath, code);
    const compileCommand = `/usr/local/bin/arduino-cli compile --fqbn ${board} "${sketchDir}" --output-dir "${sketchDir}/build"`;
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

app.post('/compile', async (req, res) => {
  const { code, board } = req.body;
  if (!code || !board) {
    return res.status(400).json({ error: 'Code and board are required' });
  }
  const sketchName = `sketch_${Date.now()}`;
  try {
    const result = await compileSketch(code, board, sketchName);
    const binaryPath = path.join(result.sketchDir, 'build', `${sketchName}.ino.hex`);
    const binary = await fs.readFile(binaryPath);
    res.json({ message: result.message, output: result.output, binary: binary.toString('base64') });
    await fs.rm(path.join(tempDir, sketchName), { recursive: true, force: true });
  } catch (error) {
    res.status(500).json(error);
    await fs.rm(path.join(tempDir, sketchName), { recursive: true, force: true });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
