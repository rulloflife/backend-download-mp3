const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ytdl = require("@distube/ytdl-core")
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');

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
                    fs.unlinkSync(audioMp4Path);

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
app.post('/download-image', async (req, res) => {
    const videoUrl = req.body.url;
    if (!videoUrl) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    const safeComment = `"Downloaded from '${videoUrl}'"`;

    try {
        console.log(`Fetching video details for: ${videoUrl}`);

        // Get video info
        const videoInfo = await ytdl.getInfo(videoUrl);
        let videoTitle = videoInfo.videoDetails.title.replace(/[<>:"\/\\|?*]+/g, '');
        videoTitle = videoTitle.replace(/\s+/g, '_');

        const thumbnailUrl = videoInfo.videoDetails.thumbnails.pop().url;

        // Define file paths
        const audioMp4Path = path.join(downloadsDir, `temp_audio.mp4`);
        const outputRawFilePath = path.join(downloadsDir, `temp_audio_1.mp3`);
        const outputFilePath = path.join(downloadsDir, `${videoTitle}.mp3`);
        const thumbnailPath = path.join(downloadsDir, `thumbnail.jpg`);

        console.log(`Downloading audio: ${videoTitle}`);

        // Download audio as .mp4
        const audioStream = ytdl(videoUrl, { quality: 'highestaudio' });
        const writeStream = fs.createWriteStream(audioMp4Path);
        audioStream.pipe(writeStream);

        // Download thumbnail image (optional)
        let imageExists = false;
        try {
            const imageResponse = await axios({ url: thumbnailUrl, responseType: 'stream' });
            const imageWriteStream = fs.createWriteStream(thumbnailPath);
            imageResponse.data.pipe(imageWriteStream);
            await new Promise((resolve) => imageWriteStream.on('finish', resolve));
            imageExists = true;
        } catch (err) {
            console.warn("Thumbnail download failed, proceeding without it.");
        }

        // Wait for audio download to finish
        await new Promise((resolve) => writeStream.on('finish', resolve));

        console.log(`Download complete: ${audioMp4Path}`);

        // Check if the audio file exists
        if (!fs.existsSync(audioMp4Path)) {
            return res.status(500).json({ error: 'Audio file missing after download' });
        }

        // Convert MP4 to MP3 and Add metadata 
        await convertToMp3(audioMp4Path, outputRawFilePath, {
            title: videoTitle || 'unknown',
            artist: videoInfo.videoDetails.author.name || 'unknown',
            album: videoInfo.videoDetails.author.name || 'unknown',
            genre: "Music",
            comment: safeComment || 'unknown'
        });

        // Optional thumbnail
        await addMetadata(outputRawFilePath, outputFilePath, imageExists ? thumbnailPath : null);

        // Clean up temporary files
        fs.unlinkSync(audioMp4Path);
        fs.unlinkSync(outputRawFilePath);
        if (imageExists) fs.unlinkSync(thumbnailPath);

        // Send response with download link
        res.json({ success: true, file: `/downloads/${videoTitle}.mp3` });

    } catch (error) {
        console.error(`Processing error: ${error.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

function convertToMp3(inputPath, outputPath, metadata) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .toFormat('mp3')
            .outputOptions([
                `-metadata`, `title=${metadata.title}`,
                `-metadata`, `artist=${metadata.artist}`,
                `-metadata`, `album=${metadata.album}`,
                `-metadata`, `genre=${metadata.genre}`,
                `-metadata`, `comment=${metadata.comment}`,
                // `-id3v2_version`, `3`
            ])
            .on('end', () => {
                console.log(`MP3 conversion complete: ${outputPath}`);
                resolve(true);
            })
            .on('error', (err) => {
                console.error(`FFmpeg MP3 conversion error: ${err.message}`);
                reject(err);
            })
            .save(outputPath);
    });
}

// Function to add metadata & thumbnail (if available)
function addMetadata(audioPath, outputPath, thumbnailPath) {
    return new Promise((resolve, reject) => {
        const command = ffmpeg().input(audioPath);

        if (thumbnailPath && fs.existsSync(thumbnailPath)) {
            command.input(thumbnailPath)
                .outputOptions([
                    '-map', '0:a',
                    '-map', '1:v?',
                    '-c:v', 'mjpeg'
                ]);
        }

        command
            .on('end', () => {
                console.log(`Metadata & thumbnail added: ${outputPath}`);
                resolve(true);
            })
            .on('error', (err) => {
                console.error(`FFmpeg metadata error: ${err.message}`);
                reject(err);
            })
            .save(outputPath);
    });
}

// Serve downloaded files
app.use('/downloads', express.static(downloadsDir));

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
