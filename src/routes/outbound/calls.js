const express = require('express');
const millis = require('../../clients/millis');
const asyncHandler = require('../../middleware/asyncHandler');
const { Readable } = require('stream');
const createError = require('http-errors');

const router = express.Router();

// Log all requests to this router for debugging
router.use((req, res, next) => {
  console.log(`🔊 Calls router - ${req.method} ${req.path}`);
  console.log(`🔊 Full URL: ${req.url}`);
  console.log(`🔊 Headers:`, req.headers);
  next();
});

// Apply CORS to all routes in this router
router.use((req, res, next) => {
  console.log(`🔊 Setting CORS headers for ${req.method} ${req.path}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type');
  
  if (req.method === 'OPTIONS') {
    console.log(`🔊 Handling OPTIONS preflight for ${req.path}`);
    return res.status(200).end();
  }
  
  next();
});

// OPTIONS handler for CORS preflight
router.options('/:sessionId/recording', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
  res.status(200).end();
});

// Handler for streaming recording
const handleRecording = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  
  console.log(`🎵 GET request for recording session: ${sessionId}`);
  console.log(`🎵 Request method: ${req.method}`);
  console.log(`🎵 Request headers:`, req.headers);
  
  const headers = {};
  if (req.headers.range) {
    headers.Range = req.headers.range;
  }

  // First check if call exists and has recording available
  let callDetail = null;
  let directRecordingUrl = null;
  try {
    console.log(`🔍 Checking call detail for session ${sessionId}...`);
    callDetail = await millis.getCallDetail(sessionId);
    console.log(`✅ Call detail found:`, JSON.stringify({
      session_id: callDetail.session_id,
      recording: callDetail.recording,
      recording_url: callDetail.recording?.recording_url,
      status: callDetail.status
    }, null, 2));
    
    // Check if call detail has a direct recording URL we can use
    // Millis returns recording_url directly in recording object
    directRecordingUrl = callDetail.recording?.recording_url || callDetail.recording?.url;
    
    if (directRecordingUrl) {
      console.log(`📎 Found direct recording URL in call detail: ${directRecordingUrl}`);
      // We'll use this S3 URL directly instead of Millis API endpoint
    } else if (callDetail.recording && callDetail.recording.available === false) {
      console.warn(`⚠️ Recording is not available for this call according to call detail`);
      return next(createError(404, 'Recording is not available for this call'));
    }
  } catch (detailError) {
    console.warn(`⚠️ Could not fetch call detail:`, detailError.message);
    console.warn(`⚠️ Continuing anyway - trying recording endpoint directly`);
    // Continue anyway - maybe recording endpoint works even if detail doesn't
  }

  // If we have a direct recording URL (S3), use it directly
  if (directRecordingUrl) {
    try {
      console.log(`📡 Streaming recording directly from S3 URL: ${directRecordingUrl}`);
      const https = require('https');
      const http = require('http');
      const url = require('url');
      
      const recordingUrl = new URL(directRecordingUrl);
      const client = recordingUrl.protocol === 'https:' ? https : http;
      
      // Set CORS headers to allow frontend access
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type');
      res.setHeader('Cache-Control', 'private, no-store');
      
      // Forward Range header if present
      const requestOptions = {
        hostname: recordingUrl.hostname,
        path: recordingUrl.pathname,
        method: req.method,
        headers: {}
      };
      
      if (req.headers.range) {
        requestOptions.headers.Range = req.headers.range;
      }
      
      // For HEAD requests, just proxy the headers
      if (req.method === 'HEAD') {
        const headReq = client.request(requestOptions, (headRes) => {
          // Forward headers
          Object.keys(headRes.headers).forEach(key => {
            if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
              res.setHeader(key, headRes.headers[key]);
            }
          });
          
          if (!res.getHeader('Content-Type')) {
            res.setHeader('Content-Type', 'audio/mpeg');
          }
          
          res.statusCode = headRes.statusCode;
          res.end();
        });
        
        headReq.on('error', (err) => {
          console.error(`❌ Error fetching HEAD from S3:`, err.message);
          return next(createError(500, 'Failed to fetch recording'));
        });
        
        headReq.end();
        return;
      }
      
      // For GET requests, stream the audio
      const getReq = client.request(requestOptions, (getRes) => {
        // Forward headers
        Object.keys(getRes.headers).forEach(key => {
          if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
            res.setHeader(key, getRes.headers[key]);
          }
        });
        
        if (!res.getHeader('Content-Type')) {
          res.setHeader('Content-Type', 'audio/mpeg');
        }
        
        res.statusCode = getRes.statusCode;
        
        // Pipe the response
        getRes.pipe(res);
      });
      
      getReq.on('error', (err) => {
        console.error(`❌ Error streaming from S3:`, err.message);
        if (!res.headersSent) {
          return next(createError(500, 'Failed to stream recording'));
        }
      });
      
      getReq.end();
      return;
      
    } catch (s3Error) {
      console.error(`❌ Error accessing S3 recording URL:`, s3Error.message);
      // Fall through to try Millis API as fallback
    }
  }

  // Fallback: Try Millis API endpoint (though it may not support GET)
  try {
    console.log(`📡 Attempting to stream recording from Millis API for session: ${sessionId}`);
    const upstream = await millis.streamCallRecording(sessionId, headers);
    const statusCode = upstream.status || 200;
    console.log(`✅ Successfully got upstream response, status: ${statusCode}`);

    // Set CORS headers to allow frontend access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type');

    if (upstream.headers) {
      const headerEntries = Object.entries(upstream.headers)
        .filter(([key]) => !['transfer-encoding', 'connection'].includes(key.toLowerCase()));
      headerEntries.forEach(([key, value]) => res.setHeader(key, value));
    }

    res.setHeader('Cache-Control', 'private, no-store');
    
    // Set Content-Type for audio if not already set
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'audio/mpeg');
    }
    
    res.status(statusCode);
    
    // For HEAD requests, don't send body
    if (req.method === 'HEAD') {
      return res.end();
    }
    
    if (upstream.data instanceof Readable) {
      upstream.data.pipe(res);
    } else {
      res.send(upstream.data);
    }
  } catch (error) {
    console.error(`❌ Error streaming recording for session ${sessionId}:`, error.message);
    console.error(`❌ Error status:`, error.status);
    console.error(`❌ Error details:`, error.response?.data || error.data);
    
    // If we have call detail, log it for debugging
    if (callDetail) {
      console.error(`📋 Call detail we fetched earlier:`, JSON.stringify({
        session_id: callDetail.session_id,
        recording: callDetail.recording,
        status: callDetail.status
      }, null, 2));
    }
    
    if (error.status === 404) {
      console.error(`❌ Millis API returned 404 - Recording not found for session ${sessionId}`);
      console.error(`💡 This might mean:`);
      console.error(`   1. The recording endpoint path is incorrect`);
      console.error(`   2. The recording hasn't been processed yet`);
      console.error(`   3. The session ID format is wrong`);
      
      // Return more helpful error
      return next(createError(404, `Recording not found for session ${sessionId}. The recording may not be available via API.`));
    }
    if (error.status === 403) {
      return next(createError(403, 'Recording access forbidden'));
    }
    if (error.status === 405) {
      console.error(`⚠️ Millis API returned 405 for session ${sessionId}`);
      console.error(`⚠️ Millis API endpoint only supports DELETE, not GET`);
      
      // If we already have callDetail with recording_url, we should have used it above
      // This means the direct S3 URL proxy failed, so return appropriate error
      if (directRecordingUrl) {
        console.error(`❌ Failed to stream from direct S3 URL: ${directRecordingUrl}`);
        return next(createError(500, 'Failed to stream recording from storage'));
      }
      
      // If we don't have direct URL, try to get it from call detail
      if (!callDetail) {
        try {
          console.log(`🔍 Attempting to fetch call detail for ${sessionId} to get recording URL...`);
          const retryCallDetail = await millis.getCallDetail(sessionId);
          console.log(`📋 Call detail response:`, JSON.stringify({
            session_id: retryCallDetail.session_id,
            recording: retryCallDetail.recording,
            status: retryCallDetail.status
          }, null, 2));
          
          const retryRecordingUrl = retryCallDetail.recording?.recording_url || retryCallDetail.recording?.url;
          if (retryRecordingUrl) {
            console.log(`📎 Found recording URL, redirecting to: ${retryRecordingUrl}`);
            // Redirect to the S3 URL directly (simple redirect - browser will handle CORS if S3 allows it)
            res.redirect(302, retryRecordingUrl);
            return;
          } else if (retryCallDetail.recording && retryCallDetail.recording.available === false) {
            return next(createError(404, 'Recording is not available for this call'));
          }
        } catch (detailError) {
          console.error(`❌ Failed to fetch call detail:`, detailError.message);
        }
      }
      
      return next(createError(405, 'Recording endpoint does not support GET requests. The recording may not be accessible via this method.'));
    }
    next(error);
  }
});

// GET /api/v1/calls/:sessionId/recording
router.get('/:sessionId/recording', handleRecording);

// HEAD /api/v1/calls/:sessionId/recording (for audio element to check if file exists)
router.head('/:sessionId/recording', handleRecording);

module.exports = router;
