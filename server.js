const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ytdl =  require("@distube/ytdl-core")
const ffmpeg = require('fluent-ffmpeg');

const app = express();
app.use(cors());
app.use(express.json());

const port = 5000;
const downloadsDir = path.resolve(__dirname, 'downloads');

// Ensure downloads directory exists
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

app.post('/download', async (req, res) => {
    const videoUrl = req.body.url;
    if (!ytdl.validateURL(videoUrl)) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    try {
        // Fetch video info
        const info = await ytdl.getInfo(videoUrl);
        let videoTitle = info.videoDetails.title;

        // Sanitize title (remove special characters that might cause file system issues)
        videoTitle = videoTitle.replace(/[<>:"/\\|?*]+/g, "").replace(/\s+/g, "_");

        const audioMp4Path = path.join(downloadsDir, `${videoTitle}.mp4`);
        const outputFilePath = path.join(downloadsDir, `${videoTitle}.mp3`);

        console.log(`Downloading audio from: ${videoUrl}`);

        // Download audio as .mp4 first
        const audioStream = ytdl(videoUrl, { quality: 'highestaudio' });
        const writeStream = fs.createWriteStream(audioMp4Path);
        audioStream.pipe(writeStream);

        writeStream.on('finish', () => {
            console.log(`Download complete: ${audioMp4Path}`);
            
            // Convert to MP3
            ffmpeg(audioMp4Path)
                .toFormat('mp3')
                .on('end', () => {
                    console.log(`Conversion complete: ${outputFilePath}`);
                    
                    // Remove the temporary .mp4 file
                    // fs.unlinkSync(audioMp4Path);

                    // Send response with download link
                    res.json({ success: true, file: `/downloads/${videoTitle}.mp3` });
                })
                .save(outputFilePath);
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Serve downloaded files
app.use('/downloads', express.static(downloadsDir));

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
