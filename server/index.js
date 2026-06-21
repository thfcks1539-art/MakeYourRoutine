const path = require('path');
const app = require('./app');
const express = require('express');

app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Routine app listening on http://localhost:${PORT}`);
});
