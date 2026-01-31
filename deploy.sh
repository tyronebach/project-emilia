#!/bin/bash
# Emilia Web App - Quick Deploy Script

set -e

echo "🚀 Deploying Emilia Web App (Milestone 1)"
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose not found. Please install Docker Compose first."
    exit 1
fi

# Check STT service
echo "🔍 Checking STT service (192.168.88.252:8765)..."
if curl -f -s http://192.168.88.252:8765/health > /dev/null 2>&1; then
    echo "✅ STT service is online"
else
    echo "⚠️  Warning: STT service appears offline"
    echo "   Make sure the Whisper STT service is running on 192.168.88.252:8765"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Build and start
echo ""
echo "🏗️  Building containers..."
docker-compose build

echo ""
echo "🚀 Starting services..."
docker-compose up -d

# Wait for services
echo ""
echo "⏳ Waiting for services to be ready..."
sleep 3

# Check health
echo ""
echo "🏥 Health check..."
if curl -f -s http://localhost:8080/api/health > /dev/null 2>&1; then
    echo "✅ Backend API is healthy"
else
    echo "❌ Backend API health check failed"
    echo "   Check logs: docker-compose logs backend"
fi

if curl -f -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Frontend is serving"
else
    echo "❌ Frontend is not responding"
    echo "   Check logs: docker-compose logs frontend"
fi

# Show status
echo ""
echo "📊 Service status:"
docker-compose ps

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Access the app:"
echo "   Frontend:  http://localhost:3000"
echo "   Backend:   http://localhost:8080"
echo "   Health:    http://localhost:8080/api/health"
echo ""
echo "📝 View logs:"
echo "   docker-compose logs -f"
echo ""
echo "🛑 Stop services:"
echo "   docker-compose down"
echo ""
