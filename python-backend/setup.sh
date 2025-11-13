#!/bin/bash

echo "🎯 Vista Computer Vision Integration Setup"
echo "=========================================="

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8+ first."
    exit 1
fi

echo "✅ Python 3 found: $(python3 --version)"

# Check if vista_m7.py exists
VISTA_PATH="$HOME/Desktop/People_count/vista_m7.py"
if [ ! -f "$VISTA_PATH" ]; then
    echo "❌ vista_m7.py not found at $VISTA_PATH"
    echo "Please ensure vista_m7.py is located at ~/Desktop/People_count/vista_m7.py"
    exit 1
fi

echo "✅ vista_m7.py found at $VISTA_PATH"

# Create Python virtual environment
echo "🔧 Setting up Python environment..."
cd "$(dirname "$0")"
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install Python dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

# Create temp directory for config files
mkdir -p ../temp
echo "✅ Created temp directory for configuration files"

# Check environment variables
echo "🔍 Checking environment variables..."
if [ -f "../.env.local" ]; then
    echo "✅ Found .env.local file"
    
    # Source the env file to check variables
    set -a
    source ../.env.local
    set +a
    
    if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
        echo "❌ NEXT_PUBLIC_SUPABASE_URL not found in .env.local"
        exit 1
    fi
    
    if [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then
        echo "❌ NEXT_PUBLIC_SUPABASE_ANON_KEY not found in .env.local"
        exit 1
    fi
    
    echo "✅ Supabase environment variables found"
else
    echo "❌ .env.local file not found in project root"
    echo "Please create .env.local with your Supabase credentials:"
    echo "NEXT_PUBLIC_SUPABASE_URL=your_supabase_url"
    echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key"
    exit 1
fi

echo ""
echo "🎉 Setup Complete!"
echo ""
echo "Next steps:"
echo "1. Make sure your camera streams are accessible"
echo "2. Start your Next.js development server: npm run dev"
echo "3. Navigate to /app/org/[your-org]/vista in your admin UI"
echo "4. Add your camera streams and start monitoring"
echo ""
echo "The Python integration will run automatically when you start monitoring."
echo "Check the console logs for any issues with vista_m7.py integration."