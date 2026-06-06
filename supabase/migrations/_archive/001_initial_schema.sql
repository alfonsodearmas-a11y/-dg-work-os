-- =====================================================
-- MODULE 1: DAILY BRIEFING
-- =====================================================

-- Cached tasks from Notion (refreshed on each load)
CREATE TABLE notion_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id VARCHAR(100) UNIQUE NOT NULL,
  title TEXT NOT NULL,
  status VARCHAR(50),
  due_date DATE,
  assignee VARCHAR(100),
  agency VARCHAR(50), -- GPL, GWI, HECI, etc.
  role VARCHAR(50), -- Ministry, GWI Board, NCN Board, UG, City Council
  priority VARCHAR(20),
  source_meeting_id VARCHAR(100), -- link to meeting that created it
  created_at TIMESTAMP,
  last_synced TIMESTAMP DEFAULT NOW()
);

-- Cached meetings from Notion
CREATE TABLE notion_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id VARCHAR(100) UNIQUE NOT NULL,
  title TEXT NOT NULL,
  meeting_date TIMESTAMP,
  attendees TEXT[],
  summary TEXT,
  action_items_count INTEGER,
  last_synced TIMESTAMP DEFAULT NOW()
);

-- Calendar events (cached from Google)
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id VARCHAR(100) UNIQUE NOT NULL,
  title TEXT NOT NULL,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  location TEXT,
  description TEXT,
  last_synced TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- MODULE 2: DOCUMENT VAULT
-- =====================================================

-- Uploaded documents
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL, -- Supabase storage path
  file_size INTEGER,
  mime_type VARCHAR(100),

  -- AI-generated metadata
  title TEXT, -- Extracted or inferred title
  summary TEXT, -- Executive summary
  document_type VARCHAR(50), -- contract, report, letter, memo, budget, etc.
  document_date DATE, -- Date mentioned in document

  -- Classification
  agency VARCHAR(50), -- GPL, GWI, HECI, MARAD, GCAA, CJIA, or NULL
  project_reference VARCHAR(50), -- Link to project if applicable
  tags TEXT[], -- Auto-generated + manual tags

  -- Key extracted data (JSON for flexibility)
  extracted_data JSONB, -- {figures: [], dates: [], names: [], commitments: []}

  -- Processing status
  processing_status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
  processed_at TIMESTAMP,

  -- Timestamps
  uploaded_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Document chunks for semantic search
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Document Q&A history
CREATE TABLE document_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- MODULE 3: PROJECT TRACKER
-- =====================================================

-- Projects from oversight.gov.gy
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_reference VARCHAR(50) UNIQUE NOT NULL,
  sub_agency VARCHAR(20), -- GPL, GWI, HECI, MARAD, GCAA, CJIA
  project_name TEXT,
  region VARCHAR(10),
  contract_value DECIMAL(15,2),
  contractor TEXT,
  completion_percent DECIMAL(5,2),
  project_status VARCHAR(30),
  allocated_balance DECIMAL(15,2),
  total_expenditure DECIMAL(15,2),
  contract_awarded_date DATE,
  agreement_start_date DATE,
  duration_months INTEGER,
  project_year INTEGER,
  project_month VARCHAR(10),
  last_updated TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Project snapshots for change tracking
CREATE TABLE project_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_reference VARCHAR(50) NOT NULL,
  snapshot_date DATE NOT NULL,
  completion_percent DECIMAL(5,2),
  project_status VARCHAR(30),
  total_expenditure DECIMAL(15,2),
  raw_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Upload history
CREATE TABLE project_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(255),
  row_count INTEGER,
  changes_summary JSONB,
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_tasks_due_date ON notion_tasks(due_date);
CREATE INDEX idx_tasks_status ON notion_tasks(status);
CREATE INDEX idx_tasks_role ON notion_tasks(role);
CREATE INDEX idx_documents_agency ON documents(agency);
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_uploaded ON documents(uploaded_at);
CREATE INDEX idx_projects_agency ON projects(sub_agency);
CREATE INDEX idx_projects_status ON projects(project_status);
CREATE INDEX idx_snapshots_ref ON project_snapshots(project_reference, snapshot_date);
