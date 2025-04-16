const googleCalendar = require('./googleCalendar');

/**
 * Lambda handler cho Google Calendar
 * Nhận một sự kiện với action và details để thực hiện các thao tác trên Google Calendar
 */
exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  try {
    // 1. Parse input
    const { action, details } = event;
    
    if (!action) {
      throw new Error('Missing required parameter: action');
    }
    
    console.log(`Processing ${action} action with details:`, JSON.stringify(details));
    
    // 2. Xử lý theo action
    switch (action.toLowerCase()) {
      case 'schedule':
        return await handleSchedule(details);
        
      case 'cancel':
        return await handleCancel(details);
        
      case 'list':
        return await handleList(details);
        
      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  } catch (error) {
    console.error('Error processing Google Calendar request:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error processing Google Calendar request',
        error: error.message
      })
    };
  }
};

/**
 * Xử lý action schedule (đặt lịch hẹn)
 * @param {Object} details - Chi tiết cuộc hẹn
 */
async function handleSchedule(details) {
  if (!details) {
    throw new Error('Missing required parameter: details');
  }
  
  const { summary, description, startTime, duration, attendees } = details;
  
  if (!summary) throw new Error('Missing required field: summary');
  if (!startTime) throw new Error('Missing required field: startTime');
  if (!duration) throw new Error('Missing required field: duration');
  if (!attendees || !Array.isArray(attendees) || attendees.length === 0) {
    throw new Error('Missing required field: attendees (should be non-empty array)');
  }
  
  try {
    // Initialize Google Calendar if needed
    await googleCalendar.initialize();
    
    // Schedule meeting
    const meetingDetails = await googleCalendar.scheduleMeeting(
      summary,
      description || 'Scheduled via WhatsApp Bot',
      startTime,
      duration,
      attendees
    );
    
    return {
      statusCode: 200,
      body: JSON.stringify(meetingDetails)
    };
  } catch (error) {
    console.error('Error scheduling meeting:', error);
    throw error; // Re-throw to be caught by main handler
  }
}

/**
 * Xử lý action cancel (hủy lịch hẹn)
 * @param {Object} details - Chi tiết cuộc hẹn cần hủy
 */
async function handleCancel(details) {
  if (!details || !details.eventId) {
    throw new Error('Missing required field: eventId');
  }
  
  try {
    // Initialize Google Calendar if needed
    await googleCalendar.initialize();
    
    // Cancel meeting
    const success = await googleCalendar.cancelMeeting(details.eventId);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: success,
        message: success ? 'Meeting cancelled successfully' : 'Meeting not found or already cancelled',
        eventId: details.eventId
      })
    };
  } catch (error) {
    console.error('Error cancelling meeting:', error);
    throw error; // Re-throw to be caught by main handler
  }
}

/**
 * Xử lý action list (liệt kê lịch hẹn)
 * @param {Object} details - Chi tiết về khoảng thời gian
 */
async function handleList(details) {
  // Chưa triển khai, có thể mở rộng sau
  return {
    statusCode: 501,
    body: JSON.stringify({
      message: 'List action not implemented yet'
    })
  };
} 