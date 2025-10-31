const { Call } = require('../models/Call');
const { Lead } = require('../models/Lead');

// Lead extraction prompt template
const LEAD_EXTRACTION_PROMPT = `
Extract lead information from the following call transcript.

Transcript:
{transcript_text}

Extract the following information in JSON format:
{
  "contact": {
    "name": "string or null",
    "phone": "string or null", 
    "email": "string or null",
    "company": "string or null",
    "title": "string or null"
  },
  "intent": "string describing what they want",
  "urgency": "hot|warm|cold",
  "next_steps": "string describing recommended next steps",
  "keywords": ["array", "of", "important", "keywords"],
  "disposition": "converted|follow_up|not_interested|callback|null"
}

If any information is not present in the transcript, use null.
Base urgency on: hot = ready to buy now, warm = interested but needs follow-up, cold = just browsing.
`;

// Mock AI service for now - replace with actual OpenAI/Claude integration
const callAI = async (prompt) => {
  // TODO: Replace with actual AI service
  // For now, return mock data based on transcript content
  const transcript = prompt.match(/Transcript:\s*(.+?)(?=\n\nExtract)/s)?.[1] || '';
  
  // Simple keyword detection for mock response
  const hasContactInfo = /(name|email|phone|contact)/i.test(transcript);
  const hasInterest = /(interested|want|need|looking|considering)/i.test(transcript);
  const hasUrgency = /(urgent|asap|immediately|today|now)/i.test(transcript);
  
  return {
    contact: hasContactInfo ? {
      name: extractName(transcript),
      phone: extractPhone(transcript),
      email: extractEmail(transcript),
      company: extractCompany(transcript),
      title: extractTitle(transcript)
    } : {
      name: null,
      phone: null,
      email: null,
      company: null,
      title: null
    },
    intent: hasInterest ? "Interested in our services" : "General inquiry",
    urgency: hasUrgency ? "hot" : hasInterest ? "warm" : "cold",
    next_steps: hasInterest ? "Follow up within 24 hours" : "Add to nurture sequence",
    keywords: extractKeywords(transcript),
    disposition: hasInterest ? "follow_up" : "not_interested"
  };
};

// Helper functions for mock extraction
function extractName(transcript) {
  const nameMatch = transcript.match(/(?:my name is|i'm|i am|this is)\s+([a-z\s]+)/i);
  return nameMatch ? nameMatch[1].trim() : null;
}

function extractPhone(transcript) {
  const phoneMatch = transcript.match(/(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/);
  return phoneMatch ? phoneMatch[1] : null;
}

function extractEmail(transcript) {
  const emailMatch = transcript.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  return emailMatch ? emailMatch[1] : null;
}

function extractCompany(transcript) {
  const companyMatch = transcript.match(/(?:company|work for|at)\s+([a-z\s&]+)/i);
  return companyMatch ? companyMatch[1].trim() : null;
}

function extractTitle(transcript) {
  const titleMatch = transcript.match(/(?:i'm|i am)\s+(?:the\s+)?([a-z\s]+)(?:at|for)/i);
  return titleMatch ? titleMatch[1].trim() : null;
}

function extractKeywords(transcript) {
  const keywords = [];
  const commonWords = ['service', 'product', 'price', 'cost', 'budget', 'timeline', 'deadline'];
  
  commonWords.forEach(word => {
    if (transcript.toLowerCase().includes(word)) {
      keywords.push(word);
    }
  });
  
  return keywords;
}

// Calculate sentiment score (simple implementation)
function calculateSentiment(transcript) {
  const positiveWords = ['good', 'great', 'excellent', 'amazing', 'love', 'perfect', 'wonderful'];
  const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'disappointed', 'frustrated'];
  
  const words = transcript.toLowerCase().split(/\s+/);
  let score = 0;
  
  words.forEach(word => {
    if (positiveWords.includes(word)) score += 1;
    if (negativeWords.includes(word)) score -= 1;
  });
  
  // Normalize to 0-1 scale
  return Math.max(0, Math.min(1, (score + words.length) / (words.length * 2)));
}

// Main extraction function
async function extractLeadFromTranscript(callId, transcriptText) {
  try {
    console.log(`Starting lead extraction for call ${callId}`);
    
    // Call AI service
    const prompt = LEAD_EXTRACTION_PROMPT.replace('{transcript_text}', transcriptText);
    const aiResponse = await callAI(prompt);
    
    // Check if we have enough contact information to create a lead
    const hasValidContact = aiResponse.contact.name || 
                           aiResponse.contact.phone || 
                           aiResponse.contact.email;
    
    if (!hasValidContact) {
      console.log(`No valid contact info found for call ${callId}`);
      await Call.findByIdAndUpdate(callId, {
        lead_extracted: false,
        extraction_confidence: 0,
        extraction_method: 'ai_mock',
        disposition: aiResponse.disposition
      });
      return null;
    }
    
    // Create lead record
    const lead = new Lead({
      call_id: callId,
      campaign_id: null, // Will be set from call if outbound
      contact: aiResponse.contact,
      intent: aiResponse.intent,
      urgency: aiResponse.urgency,
      next_steps: aiResponse.next_steps,
      keywords: aiResponse.keywords,
      status: 'new',
      notes: [],
      conversion_value: null,
      assigned_to: null,
      follow_up_date: null
    });
    
    await lead.save();
    
    // Update call record
    const sentimentScore = calculateSentiment(transcriptText);
    await Call.findByIdAndUpdate(callId, {
      lead_extracted: true,
      lead_id: lead._id,
      disposition: aiResponse.disposition,
      sentiment_score: sentimentScore,
      extraction_confidence: 0.8, // Mock confidence
      extraction_method: 'ai_mock'
    });
    
    console.log(`Lead ${lead._id} extracted successfully for call ${callId}`);
    return lead;
    
  } catch (error) {
    console.error(`Lead extraction failed for call ${callId}:`, error);
    
    // Mark extraction as failed
    await Call.findByIdAndUpdate(callId, {
      lead_extracted: false,
      extraction_confidence: 0,
      extraction_method: 'ai_mock',
      extraction_error: error.message
    });
    
    throw error;
  }
}

module.exports = {
  extractLeadFromTranscript
};
