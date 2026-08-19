const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { sequelize, User, Course, Note, Upload } = require('./db');
const { upload, handleFileUpload } = require('./upload-service');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'study-hub-super-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Serves the local uploads folder if fallback storage is used
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve Static Frontend files from parent directory
app.use(express.static(path.join(__dirname, '..')));

// Authentication Middleware
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized. Please login.' });
}

// API: Authentication
app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullname, studentId, email, password } = req.body;

    if (!fullname || !studentId || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    const existingId = await User.findOne({ where: { studentId } });
    if (existingId) {
      return res.status(400).json({ error: 'Student ID already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      fullname,
      studentId,
      email,
      password: hashedPassword
    });

    req.session.userId = user.id;
    req.session.fullname = user.fullname;

    res.status(201).json({ message: 'Registration successful', user: { id: user.id, fullname: user.fullname, email: user.email } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    req.session.userId = user.id;
    req.session.fullname = user.fullname;

    res.json({ message: 'Login successful', user: { id: user.id, fullname: user.fullname, email: user.email } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

app.get('/api/auth/me', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findByPk(req.session.userId, {
      attributes: { exclude: ['password'] }
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching profile details.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out.' });
    }
    res.json({ message: 'Logout successful' });
  });
});

// API: Profile Update
app.put('/api/profile', isAuthenticated, async (req, res) => {
  try {
    const { fullname, studentId, bio } = req.body;
    const user = await User.findByPk(req.session.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Update fields
    user.fullname = fullname || user.fullname;
    user.studentId = studentId || user.studentId;
    user.bio = bio !== undefined ? bio : user.bio;
    
    await user.save();
    
    req.session.fullname = user.fullname;

    res.json({ message: 'Profile updated successfully', user: { fullname: user.fullname, studentId: user.studentId, bio: user.bio } });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Server error updating profile.' });
  }
});

// API: Courses
app.get('/api/courses', isAuthenticated, async (req, res) => {
  try {
    const courses = await Course.findAll();
    res.json(courses);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching courses.' });
  }
});

app.post('/api/courses', isAuthenticated, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Course name is required.' });
    }

    const course = await Course.create({
      name,
      description: description || ''
    });

    res.status(201).json(course);
  } catch (error) {
    res.status(500).json({ error: 'Server error creating course.' });
  }
});

// API: Notes
app.get('/api/notes', isAuthenticated, async (req, res) => {
  try {
    const notes = await Note.findAll({
      where: { userId: req.session.userId },
      include: [{ model: Course, attributes: ['name'] }],
      order: [['createdAt', 'DESC']]
    });
    res.json(notes);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching notes.' });
  }
});

app.post('/api/notes', isAuthenticated, async (req, res) => {
  try {
    const { title, content, courseId } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required.' });
    }

    const note = await Note.create({
      title,
      content,
      courseId: courseId || null,
      userId: req.session.userId
    });

    res.status(201).json(note);
  } catch (error) {
    res.status(500).json({ error: 'Server error creating note.' });
  }
});

app.delete('/api/notes/:id', isAuthenticated, async (req, res) => {
  try {
    const note = await Note.findOne({
      where: { id: req.params.id, userId: req.session.userId }
    });

    if (!note) {
      return res.status(404).json({ error: 'Note not found.' });
    }

    await note.destroy();
    res.json({ message: 'Note deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Server error deleting note.' });
  }
});

// API: Uploads
app.get('/api/uploads', isAuthenticated, async (req, res) => {
  try {
    const uploads = await Upload.findAll({
      where: { userId: req.session.userId },
      order: [['createdAt', 'DESC']]
    });
    res.json(uploads);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching uploads.' });
  }
});

app.post('/api/uploads', isAuthenticated, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const uploadDetails = await handleFileUpload(req.file);
    if (!uploadDetails) {
      return res.status(500).json({ error: 'File upload failed.' });
    }

    const record = await Upload.create({
      filename: uploadDetails.filename,
      fileUrl: uploadDetails.fileUrl,
      fileType: uploadDetails.fileType,
      userId: req.session.userId
    });

    res.status(201).json(record);
  } catch (error) {
    console.error('File upload controller error:', error);
    res.status(500).json({ error: 'Server error during upload.' });
  }
});

// API: Dashboard Stats
app.get('/api/dashboard', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const coursesCount = await Course.count();
    const notesCount = await Note.count({ where: { userId } });
    const uploadsCount = await Upload.count({ where: { userId } });

    const recentNotes = await Note.findAll({
      where: { userId },
      limit: 2,
      order: [['createdAt', 'DESC']]
    });

    const recentUploads = await Upload.findAll({
      where: { userId },
      limit: 2,
      order: [['createdAt', 'DESC']]
    });

    res.json({
      fullname: req.session.fullname,
      stats: {
        courses: coursesCount,
        notes: notesCount,
        uploads: uploadsCount
      },
      recentNotes,
      recentUploads
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching dashboard metrics.' });
  }
});

// Catch-all route for HTML files redirecting to index.html if not authenticated
app.get('*', (req, res, next) => {
  const acceptHtml = req.headers.accept && req.headers.accept.includes('text/html');
  const pathName = req.path;
  
  if (acceptHtml) {
    const publicPaths = ['/index.html', '/Login.html', '/register.html', '/style.css'];
    const isPublic = publicPaths.includes(pathName) || pathName === '/';

    if (!req.session.userId && !isPublic) {
      return res.redirect('/index.html');
    }
  }
  next();
});

sequelize.sync({ force: false }).then(async () => {
  app.listen(PORT, () => {
    console.log(`Study Hub server running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Unable to connect to database:', err);
});
