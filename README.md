A powerful web-based database management tool similar to DBeaver, supporting multiple database types with advanced features including intelligent code completion and real-time monitoring.

## 🚀 Features

### Core Database Support
- **MySQL**: Full CRUD operations with table management
- **PostgreSQL**: Advanced query support with PostgreSQL-specific features
- **MongoDB**: Document management with JSON/BSON support
- **Redis**: NoSQL key-value store with command completion
- **SQLite**: Lightweight database support

### Advanced Editor Features
- **Intelligent Code Editor**: Powered by Ace Editor with syntax highlighting
- **SQL Auto-completion**: Context-aware SQL suggestions and table name completion
- **Redis Command Completion**: redis-cli style Tab completion with command descriptions
- **Multi-language Support**: SQL mode and Redis command mode with automatic switching
- **Syntax Highlighting**: Language-specific syntax highlighting for all supported databases

### Data Management
- **Query Execution**: Execute SQL queries and Redis commands with real-time results
- **Data Browsing**: Paginated data viewing with search and filtering capabilities
- **Table Structure Management**: View, create, and modify table structures
- **Import/Export**: Support for CSV and JSON data formats
- **Batch Operations**: Bulk data operations with progress tracking

### User Interface
- **Responsive Design**: Mobile-friendly interface with collapsible sidebar
- **Dark/Light Theme**: Professional UI with theme switching capabilities
- **Real-time Updates**: Live query results and status updates via Socket.IO
- **Connection Management**: Organized connection list with grouping support
- **Data Visualization**: Interactive tables with sorting and filtering

### Security & Authentication
- **JWT Authentication**: Secure token-based authentication
- **Role-based Access Control**: Admin and user roles with different permissions
- **Session Management**: Automatic token refresh and session timeout handling
- **Input Validation**: Comprehensive input sanitization and validation
- **Connection Security**: Support for SSL/TLS encrypted database connections

### Monitoring & Logging
- **Performance Monitoring**: Query execution time tracking and statistics
- **Connection Health**: Real-time connection status monitoring
- **Comprehensive Logging**: Winston-based logging with multiple log levels
- **Error Tracking**: Detailed error reporting with stack traces
- **Health Checks**: Server health monitoring endpoints

## 🛠️ Installation & Setup

### Prerequisites
- Node.js 16+
- NPM or Yarn
- Database instances (MySQL, PostgreSQL, MongoDB, Redis as needed)

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd mcp-anything

# Install dependencies
npm install
```

### Environment Configuration
```bash
# Copy environment template
cp .env.example .env

# Edit the configuration
nano .env
```

Environment variables:
```env
# Server Configuration
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# MySQL Configuration
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=test

# PostgreSQL Configuration
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=your_password
PG_DATABASE=test

# MongoDB Configuration
MONGODB_URL=mongodb://localhost:27017
MONGODB_DATABASE=test

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
REDIS_DB=0

# JWT Configuration
JWT_SECRET=your_jwt_secret_here_make_it_long_and_secure
JWT_EXPIRES_IN=24h

# File Upload Settings
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads
```

### Starting the Application
```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start

# Test environment
npm test
```

### Access the Application
- Open browser: http://localhost:3000
- Health check: http://localhost:3000/health
- Default admin credentials: admin / admin123

## 📖 Usage Guide

### Database Connections
1. Click "New Connection" in the left sidebar
2. Select database type (MySQL, PostgreSQL, MongoDB, Redis)
3. Configure connection parameters
4. Test connection and save
5. Connections are organized by type and support grouping

### SQL Query Editor
- **Auto-completion**: Type SQL keywords and press Tab for suggestions
- **Table Names**: Auto-completes table names from connected databases
- **Syntax Highlighting**: Color-coded SQL syntax
- **Query History**: Maintains query execution history
- **Results Export**: Export results to CSV or JSON

### Redis Command Editor
- **Command Completion**: Type partial commands and press Tab
- **Command Categories**: String, Hash, List, Set, Sorted Set commands
- **Parameter Hints**: Context-aware parameter suggestions
- **Multi-command Support**: Execute multiple Redis commands in sequence
- **Result Formatting**: Formatted display of different Redis data types

### Data Management
- **Table Data Viewer**: Browse table data with pagination and search
- **Structure Manager**: View table schemas, indexes, and relationships
- **Data Import**: Upload CSV/JSON files for data import
- **Data Export**: Export query results or entire tables
- **Batch Operations**: Perform bulk updates and deletes

## 🔌 API Documentation

### Authentication Endpoints
```http
# User Login
POST /auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}

# User Registration
POST /auth/register
Content-Type: application/json

{
  "username": "newuser",
  "email": "user@example.com",
  "password": "password123",
  "role": "user"
}
```

### Database Management
```http
# Create Database Connection
POST /api/connections
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Production MySQL",
  "type": "mysql",
  "config": {
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "password",
    "database": "production"
  }
}

# Execute SQL Query
POST /api/query/{connectionId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "sql": "SELECT * FROM users WHERE status = ? LIMIT ?",
  "params": ["active", 100]
}

# Execute Redis Commands
POST /api/redis/{connectionId}/execute
Authorization: Bearer <token>
Content-Type: application/json

{
  "commands": ["SET user:1 John", "GET user:1", "HGETALL user:1:profile"]
}
```

### Data Operations
```http
# Get Table Data
GET /api/data/{connectionId}/{database}/{table}?page=1&pageSize=50&search=keyword

# Get Table Structure
GET /api/structure/{connectionId}/{database}/{table}

# Import Data
POST /api/import/{connectionId}/{database}/{table}
Authorization: Bearer <token>
Content-Type: multipart/form-data

# Export Data
GET /api/export/{connectionId}/{database}/{table}?format=csv
```

## 📁 Project Structure

```
mcp-anything/
├── config/                    # Configuration files
│   └── database.js           # Database configuration
├── middleware/               # Express middleware
│   ├── cors.js              # CORS configuration
│   └── errorHandler.js      # Error handling middleware
├── routes/                   # API routes
│   ├── api.js               # Main API routes
│   └── auth.js              # Authentication routes
├── services/                 # Business logic services
│   ├── authService.js       # User authentication
│   ├── connectionManager.js  # Connection pool management
│   ├── dataSourceManager.js # Multi-datasource management
│   ├── mysqlService.js      # MySQL operations
│   ├── postgresqlService.js # PostgreSQL operations
│   ├── mongodbService.js    # MongoDB operations
│   └── redisService.js      # Redis operations
├── public/                   # Static frontend files
│   ├── css/                 # Stylesheets
│   ├── js/                  # JavaScript files
│   │   └── main.js          # Main application logic
│   ├── index.html           # Main application page
│   ├── login.html           # Login page
│   └── *.html               # Other UI pages
├── utils/                    # Utility functions
├── logs/                     # Application logs
├── data/                     # Data storage
├── uploads/                  # File uploads
├── server.js                 # Application entry point
├── package.json              # Dependencies and scripts
└── README.md                 # This file
```

## 🛡️ Security Features

### Authentication & Authorization
- JWT-based authentication with secure token handling
- Role-based access control (Admin/User roles)
- Password hashing using bcrypt
- Session timeout and automatic refresh
- Protected route middleware

### Data Security
- Parameterized queries to prevent SQL injection
- Input validation and sanitization
- NoSQL injection prevention for MongoDB
- Redis command validation and filtering
- Secure file upload handling

### Communication Security
- CORS configuration for cross-origin requests
- Request rate limiting
- HTTPS support with SSL/TLS
- Secure cookie handling
- Request/response logging without sensitive data

## 🔧 Technology Stack

### Backend Technologies
- **Node.js**: JavaScript runtime environment
- **Express.js**: Web application framework
- **Socket.IO**: Real-time bidirectional communication
- **JWT**: JSON Web Token authentication
- **bcrypt**: Password hashing library
- **Winston**: Comprehensive logging solution
- **dotenv**: Environment variable management

### Database Drivers
- **mysql2**: MySQL/MariaDB driver with Promise support
- **pg**: PostgreSQL client
- **mongodb**: Official MongoDB driver
- **redis**: Redis client with command support
- **sqlite3**: SQLite database driver

### Frontend Technologies
- **Bootstrap 5**: Modern CSS framework
- **jQuery**: JavaScript library for DOM manipulation
- **Ace Editor**: Embeddable code editor with syntax highlighting
- **DataTables**: Advanced table interaction plugin
- **Font Awesome**: Icon library
- **Chart.js**: Data visualization library

### Development Tools
- **Nodemon**: Development server with auto-restart
- **ESLint**: JavaScript linting utility
- **Prettier**: Code formatter
- **Git**: Version control system

## 🚀 Deployment

### Development Deployment
```bash
# Start development server
npm run dev

# View logs
tail -f logs/combined.log
```

### Production Deployment with PM2
```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start server.js --name "mcp-anything"

# Configure PM2 for production
pm2 startup
pm2 save

# Monitor application
pm2 monit

# View logs
pm2 logs mcp-anything
```

### Docker Deployment
```dockerfile
# Dockerfile example
FROM node:16-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
EXPOSE 3000

CMD ["npm", "start"]
```

```bash
# Build and run with Docker
docker build -t mcp-anything .
docker run -p 3000:3000 -v $(pwd)/data:/app/data mcp-anything
```

### Nginx Reverse Proxy
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # Proxy to Node.js application
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Static file caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## 🔍 Troubleshooting

### Common Issues

**Database Connection Failures**
- Verify database service is running
- Check connection parameters in configuration
- Ensure network connectivity
- Verify user permissions

**Auto-completion Not Working**
- Confirm `ext-language_tools.js` is loaded
- Check browser console for JavaScript errors
- Verify Ace Editor initialization
- Test with different browsers

**Performance Issues**
- Monitor database query performance
- Check connection pool settings
- Optimize large dataset queries
- Consider implementing query caching

**Memory Usage**
- Monitor Node.js memory usage
- Check for memory leaks in long-running operations
- Optimize large data result handling
- Consider implementing pagination limits

### Log Analysis
```bash
# Application logs
tail -f logs/combined.log

# Error logs
tail -f logs/error.log

# Database-specific logs
tail -f logs/mysql.log
tail -f logs/postgresql.log
tail -f logs/mongodb.log
tail -f logs/redis.log

# Authentication logs
tail -f logs/auth.log
```

## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Code Standards
- Follow ESLint configuration
- Use meaningful variable and function names
- Add JSDoc comments for complex functions
- Write clean, maintainable code
- Include tests for new features

### Commit Message Format
```
type(scope): description

# Types:
# feat: New feature
# fix: Bug fix
# docs: Documentation only
# style: Code style changes
# refactor: Code refactoring
# test: Test changes
# chore: Build process changes

# Examples:
feat(editor): add Redis command auto-completion
fix(connection): resolve MySQL connection pooling issue
docs(readme): update installation instructions
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Ace Editor** for the powerful code editing capabilities
- **Bootstrap** for the responsive UI framework
- **Database driver communities** for excellent driver support
- **Open source community** for various tools and libraries

## 📞 Support

For support, questions, or feature requests:

- **GitHub Issues**: Report bugs or request features
- **Documentation**: Check inline code documentation
- **Wiki**: Additional guides and tutorials

---

**Built with ❤️ for database management professionals**
