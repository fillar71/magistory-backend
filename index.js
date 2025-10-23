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
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const pexelsClient = createClient(process.env.PEXELS_API_KEY);

// Middleware
app.use(cors());
app.use(express.json());

// Konfigurasi Multer
const upload = multer({ dest: 'uploads/' });
ffmpeg.setFfmpegPath(ffmpegStatic);

// Pastikan direktori ada
const uploadsDir = path.join(__dirname, 'uploads');
const processedDir = path.join(__dirname, 'processed');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir);

// --- Endpoint Manual Editing (TIDAK BERUBAH) ---
app.post('/process-video', upload.single('video'), (req, res) => {
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
      });
    })
    .on('error', (err) => {
      console.error('Error FFMPEG:', err.message);
      fs.unlinkSync(videoPath);
      res.status(500).send('Gagal memproses video: ' + err.message);
    })
    .save(outputPath);
});

// --- Endpoint Pencarian Pexels (TIDAK BERUBAH) ---
app.get('/search-pexels', async (req, res) => {
    const { query } = req.query;
    if (!query) {
        return res.status(400).send('Tidak ada query pencarian.');
    }
    try {
        const pexelsResponse = await pexelsClient.videos.search({ query: query, per_page: 10 });
        res.json(pexelsResponse.videos);
    } catch (error) {
        console.error("Error di /search-pexels:", error);
        res.status(500).send("Gagal mencari Pexels: " + error.message);
    }
});

// --- Endpoint Idea to Video (PERUBAHAN BESAR) ---
app.post('/idea-to-video', async (req, res) => {
    const { idea } = req.body;
    if (!idea) {
        return res.status(400).send('Tidak ada ide yang diberikan.');
    }

    try {
        // 1. Minta skrip DAN keyword ke Gemini dalam format JSON
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
        const prompt = `
            Anda adalah asisten pembuat skrip video. Berdasarkan ide ini: "${idea}", 
            buatkan skrip untuk 3 adegan pendek.
            Untuk setiap adegan, berikan:
            1. "narration": Teks narasi singkat (1-2 kalimat).
            2. "keyword": Satu keyword pencarian video stok dalam Bahasa Inggris yang paling relevan dengan narasi.

            HANYA kembalikan jawaban dalam format JSON array yang valid, seperti ini:
            [
                {"scene": 1, "narration": "Teks narasi untuk adegan 1", "keyword": "english keyword 1"},
                {"scene": 2, "narration": "Teks narasi untuk adegan 2", "keyword": "english keyword 2"},
                {"scene": 3, "narration": "Teks narasi untuk adegan 3", "keyword": "english keyword 3"}
            ]
        `;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();
        
        // Membersihkan output Gemini (menghapus backtick markdown)
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        let scenes;
        try {
            scenes = JSON.parse(text);
        } catch (e) {
            console.error("Gagal parse JSON dari Gemini:", text);
            throw new Error("Gemini tidak mengembalikan format JSON yang valid.");
        }

        // 2. Untuk setiap adegan, cari 1 video di Pexels
        const storyboard = [];
        for (const scene of scenes) {
            console.log(`Mencari Pexels untuk keyword: ${scene.keyword}`);
            const pexelsResponse = await pexelsClient.videos.search({ 
                query: scene.keyword, 
                per_page: 1 
            });
            
            const video = pexelsResponse.videos.length > 0 ? pexelsResponse.videos[0] : null;
            
            storyboard.push({
                ...scene,
                video: video // Tambahkan objek video Pexels ke adegan
            });
        }

        // 3. Kirim storyboard lengkap ke frontend
        res.json(storyboard);

    } catch (error) {
        console.error("Error di /idea-to-video:", error);
        res.status(500).send("Gagal memproses ide: " + error.message);
    }
});

app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});
