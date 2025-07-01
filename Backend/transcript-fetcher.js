// Enhanced transcript fetching with multiple retry attempts and fallback methods
const { YoutubeTranscript } = require('youtube-transcript');

// Retry configuration
const RETRY_CONFIG = {
    maxRetries: 5,
    baseDelay: 1000, // 1 second
    maxDelay: 10000, // 10 seconds
    backoffFactor: 2
};

// Sleep utility function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Calculate retry delay with exponential backoff
const calculateRetryDelay = (attempt) => {
    const delay = RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.backoffFactor, attempt);
    return Math.min(delay, RETRY_CONFIG.maxDelay);
};

// Enhanced transcript fetching with multiple strategies
const fetchTranscriptWithRetry = async (videoId, maxRetries = RETRY_CONFIG.maxRetries) => {
    console.log(`📝 Attempting to fetch transcript for video: ${videoId}`);
    
    let lastError = null;
    
    // Strategy 1: Try different language codes
    const languageCodes = ['en', 'en-US', 'en-GB', null]; // null means auto-detect
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        console.log(`Attempt ${attempt + 1}/${maxRetries}`);
        
        // Try different language strategies on each attempt
        for (const langCode of languageCodes) {
            try {
                console.log(`Trying ${langCode ? `language: ${langCode}` : 'auto-detect language'}`);
                
                const config = langCode ? { lang: langCode } : {};
                const transcript = await YoutubeTranscript.fetchTranscript(videoId, config);
                
                if (transcript && transcript.length > 0) {
                    console.log(`✅ Successfully fetched transcript with ${transcript.length} segments`);
                    return transcript.map(item => ({
                        text: item.text,
                        start: parseFloat(item.offset),
                        duration: parseFloat(item.duration)
                    }));
                }
            } catch (error) {
                lastError = error;
                console.log(`Failed with ${langCode || 'auto-detect'}: ${error.message}`);
                
                // If it's a "No transcript found" error, try the next language
                if (error.message.includes('transcript') || error.message.includes('captions')) {
                    continue;
                }
                
                // For other errors, wait before retrying
                break;
            }
        }
        
        // Wait before next attempt (except on last attempt)
        if (attempt < maxRetries - 1) {
            const delay = calculateRetryDelay(attempt);
            console.log(`⏳ Waiting ${delay}ms before retry...`);
            await sleep(delay);
        }
    }
    
    // If all attempts failed, try alternative methods
    console.log('🔄 Trying alternative transcript fetching methods...');
    
    try {
        // Alternative method 1: Try with different video URL formats
        const alternativeFormats = [
            `https://www.youtube.com/watch?v=${videoId}`,
            `https://youtu.be/${videoId}`,
            videoId // Just the ID
        ];
        
        for (const format of alternativeFormats) {
            try {
                console.log(`Trying alternative format: ${format}`);
                const transcript = await YoutubeTranscript.fetchTranscript(format);
                
                if (transcript && transcript.length > 0) {
                    console.log(`✅ Success with alternative format!`);
                    return transcript.map(item => ({
                        text: item.text,
                        start: parseFloat(item.offset),
                        duration: parseFloat(item.duration)
                    }));
                }
            } catch (altError) {
                console.log(`Alternative format failed: ${altError.message}`);
            }
        }
        
        // Alternative method 2: Try manual transcript extraction
        const manualTranscript = await tryManualTranscriptExtraction(videoId);
        if (manualTranscript) {
            return manualTranscript;
        }
        
    } catch (altError) {
        console.error('Alternative methods failed:', altError.message);
    }
    
    // If everything failed, throw a comprehensive error
    throw new Error(
        `Failed to fetch transcript after ${maxRetries} attempts. ` +
        `Last error: ${lastError?.message || 'Unknown error'}. ` +
        `This video may not have captions available, or the captions may be auto-generated only. ` +
        `Please try with a different video that has manual captions.`
    );
};

// Manual transcript extraction as fallback
const tryManualTranscriptExtraction = async (videoId) => {
    try {
        console.log('🔧 Attempting manual transcript extraction...');
        
        // This is a more direct approach using youtube-transcript's internal methods
        const { YoutubeTranscript } = require('youtube-transcript');
        
        // Try to get available transcript languages first
        const availableTranscripts = await YoutubeTranscript.listTranscripts(videoId);
        console.log('Available transcripts:', availableTranscripts);
        
        if (availableTranscripts && availableTranscripts.length > 0) {
            // Try the first available transcript
            const firstTranscript = availableTranscripts[0];
            const transcript = await firstTranscript.fetch();
            
            if (transcript && transcript.length > 0) {
                console.log('✅ Manual extraction successful!');
                return transcript.map(item => ({
                    text: item.text,
                    start: parseFloat(item.start || item.offset),
                    duration: parseFloat(item.dur || item.duration)
                }));
            }
        }
        
        return null;
    } catch (error) {
        console.log('Manual extraction failed:', error.message);
        return null;
    }
};

// Updated main transcript fetching function
const fetchTranscript = async (videoId) => {
    try {
        // Validate video ID format
        if (!videoId || typeof videoId !== 'string' || videoId.length !== 11) {
            throw new Error('Invalid YouTube video ID format');
        }
        
        return await fetchTranscriptWithRetry(videoId);
        
    } catch (error) {
        console.error('❌ Transcript fetching failed:', error.message);
        
        // Provide helpful error messages based on error type
        if (error.message.includes('Private video')) {
            throw new Error('This video is private and its transcript cannot be accessed.');
        } else if (error.message.includes('Video unavailable')) {
            throw new Error('This video is unavailable or has been removed.');
        } else if (error.message.includes('Age restricted')) {
            throw new Error('This video is age-restricted and its transcript cannot be accessed.');
        } else if (error.message.includes('transcript') || error.message.includes('captions')) {
            throw new Error(
                'No transcript/captions found for this video. ' +
                'Please ensure the video has either:\n' +
                '• Manual captions/subtitles\n' +
                '• Auto-generated captions enabled\n' +
                '• Public accessibility settings'
            );
        } else {
            throw error;
        }
    }
};

// Test function to validate transcript availability
const validateTranscriptAvailability = async (videoId) => {
    try {
        console.log(`🔍 Checking transcript availability for: ${videoId}`);
        
        const transcript = await fetchTranscript(videoId);
        
        return {
            available: true,
            segmentCount: transcript.length,
            totalDuration: Math.max(...transcript.map(t => t.start + t.duration)),
            preview: transcript.slice(0, 3).map(t => t.text).join(' ')
        };
        
    } catch (error) {
        return {
            available: false,
            error: error.message
        };
    }
};

// Export the enhanced functions
module.exports = {
    fetchTranscript,
    fetchTranscriptWithRetry,
    validateTranscriptAvailability,
    RETRY_CONFIG
};