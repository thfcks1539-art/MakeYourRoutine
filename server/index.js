const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
app.use(express.json());
app.use(session({
  secret: 'routine-app-secret-dev',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12 }
}));

app.use('/api/classes', require('./routes/classes'));
app.use('/api/students', require('./routes/students'));
app.use('/api/routines', require('./routes/routines'));
app.use('/api/checks', require('./routes/checks'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/encouragements', require('./routes/encouragements'));

app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Routine app listening on http://localhost:${PORT}`);
});
