const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createClient } = require('pexels');

const app = express();
const port = process.env.PORT || 3000;

// --- Inisialisasi Klien API ---
// Ambil API keys dari Environment Variables di Render/Railway
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const pexelsClient = createClient(process.env.PEXELS_API_KEY);

// Middleware
app.use(cors());
app.use(express.json()); // Penting untuk membaca JSON body dari "Idea to Video"

// Konfigurasi Multer (Sama seperti sebelumnya)
const upload = multer({ dest: 'uploads/' });
ffmpeg.setFfmpegPath(ffmpegStatic);

// Pastikan direktori ada
const uploadsDir = path.join(__dirname, 'uploads');
const processedDir = path.join(__dirname, 'processed');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir);


// --- ENDPOINT 1: Manual Editing (Sama seperti sebelumnya) ---
app.post('/process-video', upload.single('video'), (req, res) => {
  // (Kode dari /process-video Anda sebelumnya ada di sini)
  // ... (Salin-tempel kode endpoint /process-video Anda yang lama) ...
  // ... (Untuk kelengkapan, saya sertakan kodenya di bawah) ...
  if (!req.file) {
    return res.status(400).send('Tidak ada file video yang diunggah.');
  }

  const { startTime, endTime } = req.body;
  const videoPath = req.file.path;
  const outputFileName = `processed-${Date.now()}-${req.file.originalname}`;
  const outputPath = path.join(processedDir, outputFileName);
  
  const duration = parseFloat(endTime) - parseFloat(startTime);
  if (isNaN(duration) || duration <= 0) {
      return res.status(400).send('Waktu mulai atau akhir tidak valid.');
  }

  console.log(`Mulai memproses: ${req.file.originalname}`);
  ffmpeg(videoPath)
    .setStartTime(startTime)
    .setDuration(duration)
    .outputOptions("-c", "copy")
    .on('end', () => {
      console.log('Pemrosesan selesai.');
      res.download(outputPath, outputFileName, (err) => {
        if (err) console.error('Error saat mengirim file:', err);
        fs.unlinkSync(videoPath);
        fs.unlinkSync(outputPath);
        console.log('File sementara telah dihapus.');
      });
    })
    .on('error', (err) => {
      console.error('Error FFMPEG:', err.message);
      fs.unlinkSync(videoPath);
      res.status(500).send('Gagal memproses video: ' + err.message);
    })
    .save(outputPath);
});


// --- ENDPOINT 2: Idea to Video (BARU) ---
app.post('/idea-to-video', async (req, res) => {
    const { idea } = req.body;
    if (!idea) {
        return res.status(400).send('Tidak ada ide yang diberikan.');
    }

    try {
        // 1. Minta script/keyword ke Gemini
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `Berikan 5 keyword pencarian video stok (dipisahkan koma) untuk ide video ini: "${idea}". Hanya berikan keyword, tanpa kalimat pembuka/penutup. Contoh: anjing berlari, taman, matahari terbenam`;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // 2. Ambil keyword pertama dari hasil Gemini
        const keywords = text.split(',').map(k => k.trim());
        const firstKeyword = keywords[0];

        if (!firstKeyword) {
            throw new Error('Gemini tidak memberikan keyword yang valid.');
        }

        console.log(`Ide: "${idea}". Keyword dari Gemini: "${firstKeyword}"`);

        // 3. Cari video di Pexels
        const pexelsResponse = await pexelsClient.videos.search({ query: firstKeyword, per_page: 5 });
        
        // 4. Kirim hasil Pexels ke frontend
        res.json(pexelsResponse.videos);

    } catch (error) {
        console.error("Error di /idea-to-video:", error);
        res.status(500).send("Gagal memproses ide: " + error.message);
    }
});


// --- ENDPOINT 3: Manual Pexels Search (BARU) ---
app.get('/search-pexels', async (req, res) => {
    const { query } = req.query;
    if (!query) {
        return res.status(400).send('Tidak ada query pencarian.');
    }

    try {
        console.log(`Mencari Pexels: "${query}"`);
        const pexelsResponse = await pexelsClient.videos.search({ query: query, per_page: 10 });
        res.json(pexelsResponse.videos);
    } catch (error) {
        console.error("Error di /search-pexels:", error);
        res.status(500).send("Gagal mencari Pexels: " + error.message);
    }
});


app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});
