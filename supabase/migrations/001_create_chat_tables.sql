-- DAIRIA Legal Chat — Supabase Schema
-- Run this in your Supabase SQL editor

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Nouvelle conversation',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS conversations_created_at_idx ON conversations(created_at DESC);

-- Row Level Security (RGPD compliance)
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Allow anon access (adjust policies for authenticated users as needed)
CREATE POLICY "Allow anon read conversations" ON conversations
  FOR SELECT USING (true);

CREATE POLICY "Allow anon insert conversations" ON conversations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anon read messages" ON messages
  FOR SELECT USING (true);

CREATE POLICY "Allow anon insert messages" ON messages
  FOR INSERT WITH CHECK (true);
