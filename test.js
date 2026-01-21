const io = require('socket.io-client');

const publicUrl = process.env.PUBLIC_URL || `http://localhost:3000`; 

const socket = io(publicUrl, {
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('Connected:', socket.id);
  
  // Subscribe to driver updates
  socket.emit('subscribe', {
    driver_id: 'driver_001',  
    since: '2024-09-16T08:00:05Z'  
  });
});

socket.on('driver_subscription_success', (data) => {
  console.log('Subscribed successfully:', data);
});

socket.on('driver_location_update', (data) => {
  console.log('Location update:', data);
});

socket.on('disconnect', () => {
  console.log('Disconnected');
});