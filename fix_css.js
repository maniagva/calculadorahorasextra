const fs = require('fs');
let content = fs.readFileSync('style.css', 'utf-8');
const lines = content.split('\n');
const clean = lines.slice(0, 971).join('\n');

const css = `
/* ── REVIEW TABLE (NIVEL 2) ───────────────────────────── */
.review-container {
  margin-top: 1rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  animation: fadeSlideIn 0.4s ease;
}

.review-header h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 0.3rem;
}

.review-header p {
  font-size: 0.85rem;
  color: var(--color-text-dim);
  margin-bottom: 1.2rem;
}

.review-table-wrapper {
  max-height: 300px;
  overflow-y: auto;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  margin-bottom: 1.2rem;
}

.review-table {
  width: 100%;
  border-collapse: collapse;
}

.review-table th {
  background: rgba(255, 255, 255, 0.02);
  padding: 0.75rem 1rem;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-dim);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
}

.review-table td {
  padding: 0.5rem 0.5rem;
  border-bottom: 1px solid var(--color-border);
}

.review-table tr:last-child td {
  border-bottom: none;
}

.review-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--color-text);
  font-family: 'Inter', sans-serif;
  font-size: 0.9rem;
  padding: 0.4rem 0.6rem;
  transition: all 0.2s ease;
}

.review-input:hover {
  background: rgba(255, 255, 255, 0.06);
}

.review-input:focus {
  outline: none;
  border-color: var(--color-primary);
  background: rgba(99, 102, 241, 0.1);
}

.review-input--date {
  width: 110px;
}

.review-input--time {
  width: 80px;
}

.btn-remove-row {
  background: transparent;
  border: none;
  color: var(--color-text-dim);
  cursor: pointer;
  padding: 0.4rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-remove-row:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.review-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.btn-outline {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  font-weight: 500;
  cursor: pointer;
}

.btn-outline:hover {
  background: rgba(255, 255, 255, 0.05);
}
`;

fs.writeFileSync('style.css', clean + '\n' + css, 'utf-8');
