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

    try {
        console.log(`Fetching video details for: ${videoUrl}`);
        const videoInfo = await ytdl.getInfo(videoUrl);

        let videoTitle = sanitizeFilename(videoInfo.videoDetails.title);
        const thumbnailUrl = videoInfo.videoDetails.thumbnails.pop().url;

        // Ensure UTF-8 filenames
        const safeTitle = sanitizeFilename(videoTitle);  // Properly sanitize Unicode filenames
        const safeArtist = sanitizeFilename(videoInfo.videoDetails.author.name);

        const audioMp4Path = path.join(downloadsDir, `temp_audio.mp4`);
        const outputRawFilePath = path.join(downloadsDir, `temp_audio_1.mp3`);
        const outputFilePath = path.join(downloadsDir, `${safeTitle}.mp3`);
        const thumbnailPath = path.join(downloadsDir, `thumbnail.jpg`);

        console.log(`Downloading audio: ${safeTitle}`);

        // Download audio as .mp4
        const audioStream = ytdl(videoUrl, { quality: 'highestaudio' });
        const writeStream = fs.createWriteStream(audioMp4Path);
        audioStream.pipe(writeStream);

        // Download thumbnail image
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

        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve); // Resolve when file writing is complete

            writeStream.on('error', (err) => {
                console.error("File write error:", err.message);
                reject(new Error("Failed to write file: " + err.message));
            });
        });
        console.log(`Download complete: ${audioMp4Path}`);

        if (!fs.existsSync(audioMp4Path)) {
            return res.status(500).json({ error: 'Audio file missing after download' });
        }

        console.log('Title:', safeTitle);
        console.log('Artist:', safeArtist);

        // Convert MP4 to MP3 with metadata
        await convertToMp3(audioMp4Path, outputRawFilePath, {
            title: '',
            artist: '',
            album: '',
            genre: '',
            comment: ''
        });

        // Add thumbnail and finalize metadata
        await addMetadata(outputRawFilePath, outputFilePath, imageExists ? thumbnailPath : null);

        // Cleanup
        fs.unlinkSync(audioMp4Path);
        fs.unlinkSync(outputRawFilePath);
        if (imageExists) fs.unlinkSync(thumbnailPath);

        res.json({ success: true, file: `/downloads/${safeTitle}.mp3` });

    } catch (error) {
        console.error(`Processing error: ${error.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/download-image-detail', async (req, res) => {
    const videoUrl = req.body.url;
    if (!videoUrl) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    try {
        console.log(`Fetching video details for: ${videoUrl}`);
        const videoInfo = await ytdl.getInfo(videoUrl);

        let videoTitle = sanitizeFilename(videoInfo.videoDetails.title);
        const thumbnailUrl = videoInfo.videoDetails.thumbnails.pop().url;

        // Ensure UTF-8 filenames
        const safeTitle = sanitizeFilename(videoTitle);  // Properly sanitize Unicode filenames
        const safeArtist = sanitizeFilename(videoInfo.videoDetails.author.name);

        const audioMp4Path = path.join(downloadsDir, `temp_audio.mp4`);
        const outputRawFilePath = path.join(downloadsDir, `temp_audio_1.mp3`);
        const outputFilePath = path.join(downloadsDir, `${safeTitle}.mp3`);
        const thumbnailPath = path.join(downloadsDir, `thumbnail.jpg`);

        console.log(`Downloading audio: ${safeTitle}`);

        // Download audio as .mp4
        try {
            const audioStream = ytdl(videoUrl, { quality: 'highestaudio' });
            const writeStream = fs.createWriteStream(audioMp4Path);
            audioStream.pipe(writeStream);
            await new Promise((resolve, reject) => {
                writeStream.on('finish', resolve);
            
                writeStream.on('error', (err) => {
                    console.error("File write error:", err.message);
                    reject(new Error("File download failed: " + err.message));
                });
            
                audioStream.on('error', (err) => {
                    console.error("YouTube download error:", err.message);
                    reject(new Error("YouTube download failed: " + err.message));
                });
            });
        } catch (err) {
            console.error("YouTube download error:", err.message);
        }

        // Download thumbnail image
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
        console.log(`Download complete: ${audioMp4Path}`);

        if (!fs.existsSync(audioMp4Path)) {
            return res.status(500).json({ error: 'Audio file missing after download' });
        }

        console.log('Title:', safeTitle);
        console.log('Artist:', safeArtist);

        // Convert MP4 to MP3 with metadata
        await convertToMp3(audioMp4Path, outputRawFilePath, {
            title: safeTitle || 'unknown',
            artist: safeArtist || 'unknown',
            album: safeArtist || 'unknown',
            genre: "Music",
            comment: `Downloaded from '${videoUrl}'`
        });

        // Add thumbnail and finalize metadata
        await addMetadata(outputRawFilePath, outputFilePath, imageExists ? thumbnailPath : null);

        // Cleanup
        fs.unlinkSync(audioMp4Path);
        fs.unlinkSync(outputRawFilePath);
        if (imageExists) fs.unlinkSync(thumbnailPath);

        res.json({ success: true, file: `/downloads/${safeTitle}.mp3` });

    } catch (error) {
        console.error(`Processing error: ${error.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Convert MP4 to MP3 with Unicode support
function convertToMp3(inputPath, outputPath, metadata) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .toFormat('mp3')
            .outputOptions([
                `-metadata`, `title=${metadata.title !== '' ? metadata.title.replace(/["]/g, '') : ''}`,
                `-metadata`, `artist=${metadata.artist !== '' ? metadata.artist.replace(/["]/g, '') : ''}`,
                `-metadata`, `album=${metadata.album !== '' ? metadata.album.replace(/["]/g, '') : ''}`,
                `-metadata`, `genre=${metadata.genre}`,
                `-metadata`, `comment=${metadata.comment !== '' ? metadata.comment.replace(/["]/g, '') : ''}`,
                '-id3v2_version', '3',  // Use ID3v2.3 for Unicode
                '-metadata', 'encoding=UTF-8' // Ensures correct metadata encoding
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

// Add metadata & thumbnail (if available)
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
            .outputOptions([
                '-id3v2_version', '3',  // ID3v2.3 is the best format for Unicode
                '-metadata', 'encoding=UTF-8' // Ensures FFmpeg metadata works with Unicode
            ])
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

// Sanitize filename for Unicode support
const sanitizeFilename = (title) => {
    return title
        .normalize("NFKD")  // Normalize Unicode (e.g., ü → u)
        .replace(/[\u0300-\u036f]/g, "") // Remove diacritics (accents)
        .replace(/[<>:"\/\\|?*]+/g, '') // Remove invalid filesystem characters
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .trim();
};

const sanitizeName = (title) => {
    return title
        .normalize("NFKD")  // Normalize Unicode (e.g., ü → u)
        .replace(/[\u0300-\u036f]/g, "") // Remove diacritics (accents)
        .replace(/[<>:"\/\\|?*]+/g, '') // Remove invalid filesystem characters
        .trim();
};


// Serve downloaded files
app.use('/downloads', express.static(downloadsDir));

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
