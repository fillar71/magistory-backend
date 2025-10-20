const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

const upload = multer({ dest: 'uploads/' });

ffmpeg.setFfmpegPath(ffmpegStatic);

const uploadsDir = path.join(__dirname, 'uploads');
const processedDir = path.join(__dirname, 'processed');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir);

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
  console.log(`Potong dari ${startTime} selama ${duration} detik.`);

  ffmpeg(videoPath)
    .setStartTime(startTime)
    .setDuration(duration)
    .outputOptions("-c", "copy")
    .on('end', () => {
      console.log('Pemrosesan selesai.');
      res.download(outputPath, outputFileName, (err) => {
        if (err) {
          console.error('Error saat mengirim file:', err);
        }
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

app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});
