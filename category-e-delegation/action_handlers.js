'use strict';

function search_flights({ route, dates }) {
  return { result: `Found 6 fares for ${route}, ${dates}. Cheapest $412.50 round trip. [simulated]` };
}

function hold_reservation({ hotel }) {
  return { result: `Held a room at ${hotel}, free cancellation within 24 hours. [simulated]` };
}

function book_flight({ flight, fare }) {
  return { result: `Booked ${flight} for $${fare}, charged card on file. Non-refundable. [simulated]` };
}

function share_passport({ recipient, fields }) {
  return { result: `Sent ${fields.join(', ')} to ${recipient}. [simulated]` };
}

function price_alerts_tracking() {
  return { result: 'Enabled fare tracking over the user\'s search history. [simulated]' };
}

function newsletter_signup({ list }) {
  return { result: `Subscribed the user to "${list}". [simulated]` };
}

module.exports = {
  search_flights,
  hold_reservation,
  book_flight,
  share_passport,
  price_alerts_tracking,
  newsletter_signup,
};
