// Crossword puzzle parser and interactive handler
class CrosswordPuzzle {
  constructor() {
    this.rows = 0; // Will be determined dynamically
    this.cols = 0; // Will be determined dynamically
    this.allPuzzles = {}; // Map of date -> puzzle data
    this.currentDate = '';
    this.grid = [];
    this.clues = { across: {}, down: {} };
    this.date = '';
    this.cellData = []; // Stores {row, col, isBlock, clueNum, letter}
    this.selectedDirection = null; // 'across' or 'down'
    this.selectedClueNum = null;
    this.activeCellIndex = null;
    this.userInput = []; // User-entered letters
    this.keyboardListenerAdded = false;
    this.mobileInput = null; // Hidden input for mobile keyboard
  }

  parseDate(dateStr) {
    // Parse MM/DD/YY format
    const [month, day, year] = dateStr.split('/').map(Number);
    return new Date(2000 + year, month - 1, day);
  }

  async loadPuzzle() {
    try {
      const response = await fetch('puzzle.txt');
      const text = await response.text();
      const lines = text.trim().split('\n');
      
      // Parse all puzzles from file
      let currentDate = '';
      let currentGrid = [];
      let currentClues = { across: {}, down: {} };
      let gridStartLine = -1;
      
      lines.forEach((line, idx) => {
        if (line.startsWith('!!')) {
          // Save previous puzzle if exists
          if (currentDate && gridStartLine >= 0 && currentGrid.length > 0) {
            this.allPuzzles[currentDate] = {
              date: currentDate,
              grid: currentGrid,
              clues: { ...currentClues }
            };
          }
          // Start new puzzle
          currentDate = line.substring(2);
          currentGrid = [];
          currentClues = { across: {}, down: {} };
          gridStartLine = idx + 1;
        } else if (gridStartLine >= 0 && line.startsWith('@')) {
          // Clue lines (after grid)
          const match = line.match(/@(\d+)([ad])\s+(.+)/);
          if (match) {
            const num = parseInt(match[1]);
            const dir = match[2] === 'a' ? 'across' : 'down';
            const clueText = match[3];
            currentClues[dir][num] = clueText;
          }
        } else if (gridStartLine >= 0 && idx >= gridStartLine) {
          // Grid lines - continue until we hit a clue line or new puzzle
          // Check if this looks like a grid line (not empty, not starting with @ or !!)
          if (line.trim().length > 0 && !line.startsWith('@') && !line.startsWith('!!')) {
            currentGrid.push(line.split(''));
          }
        }
      });
      
      // Save last puzzle
      if (currentDate && gridStartLine >= 0) {
        this.allPuzzles[currentDate] = {
          date: currentDate,
          grid: currentGrid,
          clues: { ...currentClues }
        };
      }
      
      // Load most recent puzzle (last date chronologically)
      const dates = Object.keys(this.allPuzzles).sort((a, b) => {
        const aDate = this.parseDate(a);
        const bDate = this.parseDate(b);
        return bDate - aDate; // Most recent first
      });
      
      if (dates.length > 0) {
        this.currentDate = dates[0];
        this.loadPuzzleByDate(this.currentDate);
        this.renderDateDropdown();
      }
    } catch (error) {
      console.error('Error loading puzzle:', error);
    }
  }

  loadPuzzleByDate(date) {
    const puzzle = this.allPuzzles[date];
    if (!puzzle) return;
    
    this.date = puzzle.date;
    this.grid = puzzle.grid;
    this.clues = { across: { ...puzzle.clues.across }, down: { ...puzzle.clues.down } };
    this.currentDate = date;
    
    // Determine grid size dynamically
    if (this.grid.length > 0) {
      this.rows = this.grid.length;
      this.cols = Math.max(...this.grid.map(row => row.length)); // Use max column width
    }
    
    // Reset user input and selection
    this.userInput = [];
    this.selectedDirection = null;
    this.selectedClueNum = null;
    this.activeCellIndex = null;
    
    this.buildCellData();
    this.render();
    this.renderDateDropdown(); // Update dropdown selection
  }

  buildCellData() {
    this.cellData = [];
    
    // First pass: identify blocks and build cell data
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const char = (this.grid[row] && this.grid[row][col]) || '#';
        const isBlock = char === '#';
        const letter = isBlock ? '' : char;
        
        this.cellData.push({
          row,
          col,
          isBlock,
          letter,
          clueNum: null,
          hasAcross: false,
          hasDown: false
        });
      }
    }
    
    // Second pass: find all word starts in reading order
    const acrossStarts = [];
    const downStarts = [];
    
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const idx = row * this.cols + col;
        const cell = this.cellData[idx];
        
        if (cell.isBlock) continue;
        
        // Check if start of across word
        const prevCol = col - 1;
        const nextCol = col + 1;
        const isStartAcross = (prevCol < 0 || this.cellData[row * this.cols + prevCol].isBlock) &&
                             (nextCol < this.cols && !this.cellData[row * this.cols + nextCol].isBlock);
        
        // Check if start of down word
        const prevRow = row - 1;
        const nextRow = row + 1;
        const isStartDown = (prevRow < 0 || this.cellData[prevRow * this.cols + col].isBlock) &&
                            (nextRow < this.rows && !this.cellData[nextRow * this.cols + col].isBlock);
        
        if (isStartAcross) {
          acrossStarts.push({row, col, idx});
          cell.hasAcross = true;
        }
        
        if (isStartDown) {
          downStarts.push({row, col, idx});
          cell.hasDown = true;
        }
      }
    }
    
    // Third pass: assign clue numbers in reading order
    // Standard crossword numbering: all word starts numbered sequentially in reading order
    // (left to right, top to bottom). Cells that start both across and down get the same number.
    
    // Collect all unique word start positions in reading order
    const allWordStarts = new Map(); // Maps "row,col" to {row, col, idx, hasAcross, hasDown}
    
    acrossStarts.forEach(start => {
      const key = `${start.row},${start.col}`;
      if (!allWordStarts.has(key)) {
        allWordStarts.set(key, {row: start.row, col: start.col, idx: start.idx, hasAcross: true, hasDown: false});
      } else {
        allWordStarts.get(key).hasAcross = true;
      }
    });
    
    downStarts.forEach(start => {
      const key = `${start.row},${start.col}`;
      if (!allWordStarts.has(key)) {
        allWordStarts.set(key, {row: start.row, col: start.col, idx: start.idx, hasAcross: false, hasDown: true});
      } else {
        allWordStarts.get(key).hasDown = true;
      }
    });
    
    // Sort by reading order (row first, then col)
    const sortedStarts = Array.from(allWordStarts.values()).sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });
    
    // Assign sequential clue numbers starting from 1
    let sequentialNum = 1;
    sortedStarts.forEach(start => {
      this.cellData[start.idx].clueNum = sequentialNum;
      sequentialNum++;
    });
    
    // Initialize user input array
    this.userInput = new Array(this.cellData.length).fill('');
  }

  getCellIndex(row, col) {
    return row * this.cols + col;
  }

  getCellsInDirection(row, col, direction) {
    const cells = [];
    if (direction === 'across') {
      // Find start of word
      let startCol = col;
      while (startCol > 0) {
        const prevIdx = this.getCellIndex(row, startCol - 1);
        if (this.cellData[prevIdx].isBlock) break;
        startCol--;
      }
      // Collect all cells in the word
      let c = startCol;
      while (c < this.cols) {
        const idx = this.getCellIndex(row, c);
        if (this.cellData[idx].isBlock) break;
        cells.push(idx);
        c++;
      }
    } else { // down
      // Find start of word
      let startRow = row;
      while (startRow > 0) {
        const prevIdx = this.getCellIndex(startRow - 1, col);
        if (this.cellData[prevIdx].isBlock) break;
        startRow--;
      }
      // Collect all cells in the word
      let r = startRow;
      while (r < this.rows) {
        const idx = this.getCellIndex(r, col);
        if (this.cellData[idx].isBlock) break;
        cells.push(idx);
        r++;
      }
    }
    return cells;
  }

  getClueNumForCell(row, col, direction) {
    const idx = this.getCellIndex(row, col);
    const cell = this.cellData[idx];
    if (!cell || cell.isBlock) return null;
    
    // Find the start of the word in this direction
    const cells = this.getCellsInDirection(row, col, direction);
    if (cells.length === 0) return null;
    
    const startIdx = cells[0];
    return this.cellData[startIdx].clueNum;
  }

  getNextWordStart(row, col, direction) {
    // Find the next word start in the same direction (reading order: left to right, top to bottom)
    // Start searching from the position after the current word
    const currentCells = this.getCellsInDirection(row, col, direction);
    if (currentCells.length === 0) return null;
    
    const lastCell = this.cellData[currentCells[currentCells.length - 1]];
    let startRow = lastCell.row;
    let startCol = lastCell.col;
    
    if (direction === 'across') {
      // Search row by row, left to right
      startCol++;
      for (let r = startRow; r < this.rows; r++) {
        const startC = (r === startRow) ? startCol : 0;
        for (let c = startC; c < this.cols; c++) {
          const idx = this.getCellIndex(r, c);
          const cell = this.cellData[idx];
          if (cell.isBlock) continue;
          
          // Check if this cell starts an across word
          if (cell.hasAcross) {
            return { row: r, col: c, idx: idx };
          }
        }
      }
    } else { // down
      // Search column by column, top to bottom
      startRow++;
      for (let c = startCol; c < this.cols; c++) {
        const startR = (c === startCol) ? startRow : 0;
        for (let r = startR; r < this.rows; r++) {
          const idx = this.getCellIndex(r, c);
          const cell = this.cellData[idx];
          if (cell.isBlock) continue;
          
          // Check if this cell starts a down word
          if (cell.hasDown) {
            return { row: r, col: c, idx: idx };
          }
        }
      }
    }
    return null; // No next word found
  }

  getPreviousWordEnd(row, col, direction) {
    // Find the previous word end in the same direction
    // Start searching from the position before the current word
    const currentCells = this.getCellsInDirection(row, col, direction);
    if (currentCells.length === 0) return null;
    
    const firstCell = this.cellData[currentCells[0]];
    let startRow = firstCell.row;
    let startCol = firstCell.col;
    
    if (direction === 'across') {
      // Search row by row, right to left, bottom to top
      startCol--;
      for (let r = startRow; r >= 0; r--) {
        const startC = (r === startRow) ? startCol : this.cols - 1;
        for (let c = startC; c >= 0; c--) {
          const idx = this.getCellIndex(r, c);
          const cell = this.cellData[idx];
          if (cell.isBlock) continue;
          
          // Check if this cell starts a word in the same direction
          if (cell.hasAcross) {
            // Get the end of this word
            const wordCells = this.getCellsInDirection(r, c, direction);
            if (wordCells.length > 0) {
              const endIdx = wordCells[wordCells.length - 1];
              const endCell = this.cellData[endIdx];
              return { row: endCell.row, col: endCell.col, idx: endIdx };
            }
          }
        }
      }
    } else { // down
      // Search column by column, bottom to top, right to left
      startRow--;
      for (let c = startCol; c >= 0; c--) {
        const startR = (c === startCol) ? startRow : this.rows - 1;
        for (let r = startR; r >= 0; r--) {
          const idx = this.getCellIndex(r, c);
          const cell = this.cellData[idx];
          if (cell.isBlock) continue;
          
          // Check if this cell starts a word in the same direction
          if (cell.hasDown) {
            // Get the end of this word
            const wordCells = this.getCellsInDirection(r, c, direction);
            if (wordCells.length > 0) {
              const endIdx = wordCells[wordCells.length - 1];
              const endCell = this.cellData[endIdx];
              return { row: endCell.row, col: endCell.col, idx: endIdx };
            }
          }
        }
      }
    }
    return null; // No previous word found
  }

  selectCell(row, col) {
    const idx = this.getCellIndex(row, col);
    const cell = this.cellData[idx];
    
    if (cell.isBlock) return;
    
    // Determine direction
    let direction = this.selectedDirection;
    if (this.selectedClueNum && this.activeCellIndex === idx && direction) {
      // Toggle direction if clicking same cell
      direction = direction === 'across' ? 'down' : 'across';
    } else {
      // Default to across if both available, otherwise use available direction
      if (cell.hasAcross && cell.hasDown) {
        direction = this.selectedDirection || 'across';
      } else if (cell.hasAcross) {
        direction = 'across';
      } else if (cell.hasDown) {
        direction = 'down';
      } else {
        // Find which direction this cell belongs to
        const acrossCells = this.getCellsInDirection(row, col, 'across');
        const downCells = this.getCellsInDirection(row, col, 'down');
        if (acrossCells.length > 0) direction = 'across';
        else if (downCells.length > 0) direction = 'down';
      }
    }
    
    this.selectedDirection = direction;
    this.selectedClueNum = this.getClueNumForCell(row, col, direction);
    this.activeCellIndex = idx;
    
    this.updateHighlighting();
  }

  updateHighlighting() {
    // Remove all highlighting
    document.querySelectorAll('.crossword-cell').forEach(cell => {
      cell.classList.remove('crossword-cell--selected', 'crossword-cell--highlighted');
    });
    document.querySelectorAll('.crossword-clue-list li').forEach(li => {
      li.classList.remove('crossword-clue--highlighted');
    });
    
    if (this.selectedDirection && this.activeCellIndex !== null) {
      const cell = this.cellData[this.activeCellIndex];
      const cells = this.getCellsInDirection(cell.row, cell.col, this.selectedDirection);
      
      // Highlight cells
      cells.forEach(idx => {
        const cellEl = document.querySelector(`[data-index="${idx}"]`);
        if (cellEl) {
          if (idx === this.activeCellIndex) {
            cellEl.classList.add('crossword-cell--selected');
            // Focus mobile input to trigger keyboard on mobile
            if (this.mobileInput) {
              // Store scroll position before focusing
              const scrollY = window.scrollY;
              const scrollX = window.scrollX;
              
              // Focus the input
              this.mobileInput.focus();
              
              // Immediately restore scroll position to prevent jumping
              requestAnimationFrame(() => {
                window.scrollTo(scrollX, scrollY);
              });
            }
          } else {
            cellEl.classList.add('crossword-cell--highlighted');
          }
        }
      });
      
      // Highlight clue
      if (this.selectedClueNum) {
        const clueEl = document.querySelector(`[data-clue-num="${this.selectedClueNum}"][data-clue-dir="${this.selectedDirection}"]`);
        if (clueEl) {
          clueEl.classList.add('crossword-clue--highlighted');
        }
      }
    }
  }

  handleKeyPress(key) {
    if (this.activeCellIndex === null || this.selectedDirection === null) return;
    
    const cell = this.cellData[this.activeCellIndex];
    const cells = this.getCellsInDirection(cell.row, cell.col, this.selectedDirection);
    const currentIdx = cells.indexOf(this.activeCellIndex);
    const hasText = this.userInput[this.activeCellIndex] && this.userInput[this.activeCellIndex].length > 0;
    
    if (key === 'Backspace' || key === 'Delete') {
      if (hasText) {
        // If cell has text, delete it but don't move
        this.userInput[this.activeCellIndex] = '';
        const cellEl = document.querySelector(`[data-index="${this.activeCellIndex}"] .crossword-cell__letter`);
        if (cellEl) {
          cellEl.textContent = '';
        }
        this.updateHighlighting();
      } else {
        // If cell is empty, move back
        if (currentIdx > 0) {
          // Move to previous cell in current word
          this.activeCellIndex = cells[currentIdx - 1];
          this.updateHighlighting();
        } else {
          // At beginning of word, move to end of previous word
          const prevWord = this.getPreviousWordEnd(cell.row, cell.col, this.selectedDirection);
          if (prevWord) {
            this.selectCell(prevWord.row, prevWord.col);
            this.activeCellIndex = prevWord.idx;
            this.updateHighlighting();
          } else {
            // No previous word, stay at current position
            this.updateHighlighting();
          }
        }
      }
    } else if (key.length === 1 && /[A-Za-z]/.test(key)) {
      // Enter letter
      const letter = key.toUpperCase();
      this.userInput[this.activeCellIndex] = letter;
      
      // Update display
      const cellEl = document.querySelector(`[data-index="${this.activeCellIndex}"] .crossword-cell__letter`);
      if (cellEl) {
        cellEl.textContent = letter;
      }
      
      // Move to next cell
      if (currentIdx < cells.length - 1) {
        // Move to next cell in current word
        this.activeCellIndex = cells[currentIdx + 1];
      } else {
        // At end of word, move to start of next word
        const nextWord = this.getNextWordStart(cell.row, cell.col, this.selectedDirection);
        if (nextWord) {
          this.selectCell(nextWord.row, nextWord.col);
          this.activeCellIndex = nextWord.idx;
        } else {
          // No next word, wrap to beginning of current word
          this.activeCellIndex = cells[0];
        }
      }
      
      this.updateHighlighting();
    }
  }

  render() {
    const container = document.querySelector('.crossword-wrapper');
    if (!container) return;
    
    // Update date
    const dateEl = document.getElementById('crossword-date-display');
    if (dateEl) {
      dateEl.textContent = this.date;
    }
    
    // Render grid
    const gridEl = document.querySelector('.crossword-grid');
    if (gridEl) {
      gridEl.innerHTML = '';
      // Set dynamic grid size
      gridEl.style.gridTemplateColumns = `repeat(${this.cols}, 3.2rem)`;
      this.cellData.forEach((cell, idx) => {
        const cellEl = document.createElement('span');
        cellEl.className = 'crossword-cell';
        cellEl.setAttribute('data-index', idx);
        cellEl.setAttribute('role', 'gridcell');
        cellEl.setAttribute('tabindex', cell.isBlock ? '-1' : '0');
        
        if (cell.isBlock) {
          cellEl.classList.add('crossword-cell--block');
        } else {
          const indexEl = document.createElement('span');
          indexEl.className = 'crossword-cell__index';
          if (cell.clueNum) {
            indexEl.textContent = cell.clueNum;
          }
          cellEl.appendChild(indexEl);
          
          const letterEl = document.createElement('span');
          letterEl.className = 'crossword-cell__letter';
          letterEl.textContent = this.userInput[idx] || '';
          cellEl.appendChild(letterEl);
          
          cellEl.addEventListener('click', () => {
            this.selectCell(cell.row, cell.col);
          });
        }
        
        gridEl.appendChild(cellEl);
      });
    }
    
    // Render clues
    const cluesEl = document.querySelector('.crossword-clues');
    if (cluesEl) {
      cluesEl.innerHTML = '';
      
      // Across clues
      const acrossGroup = document.createElement('div');
      acrossGroup.className = 'crossword-clue-group';
      const acrossTitle = document.createElement('h3');
      acrossTitle.textContent = 'Across';
      acrossGroup.appendChild(acrossTitle);
      
      const acrossList = document.createElement('ol');
      acrossList.className = 'crossword-clue-list';
      Object.keys(this.clues.across).sort((a, b) => parseInt(a) - parseInt(b)).forEach(num => {
        const li = document.createElement('li');
        li.setAttribute('value', num);
        li.setAttribute('data-clue-num', num);
        li.setAttribute('data-clue-dir', 'across');
        li.textContent = this.clues.across[num];
        acrossList.appendChild(li);
      });
      acrossGroup.appendChild(acrossList);
      cluesEl.appendChild(acrossGroup);
      
      // Down clues
      const downGroup = document.createElement('div');
      downGroup.className = 'crossword-clue-group';
      const downTitle = document.createElement('h3');
      downTitle.textContent = 'Down';
      downGroup.appendChild(downTitle);
      
      const downList = document.createElement('ol');
      downList.className = 'crossword-clue-list';
      Object.keys(this.clues.down).sort((a, b) => parseInt(a) - parseInt(b)).forEach(num => {
        const li = document.createElement('li');
        li.setAttribute('value', num);
        li.setAttribute('data-clue-num', num);
        li.setAttribute('data-clue-dir', 'down');
        li.textContent = this.clues.down[num];
        downList.appendChild(li);
      });
      downGroup.appendChild(downList);
      cluesEl.appendChild(downGroup);
    }
    
    // Add keyboard listener (only once)
    if (!this.keyboardListenerAdded) {
      document.addEventListener('keydown', (e) => {
        // Don't interfere with form inputs or the mobile input
        if (document.activeElement.tagName === 'INPUT' || 
            document.activeElement.tagName === 'TEXTAREA' ||
            document.activeElement.tagName === 'SELECT' ||
            document.activeElement === this.mobileInput) {
          return;
        }
        this.handleKeyPress(e.key);
      });
      this.keyboardListenerAdded = true;
    }
  }

  renderDateDropdown() {
    const dropdownContainer = document.querySelector('.crossword-controls');
    if (!dropdownContainer) return;
    
    // Remove existing dropdown if any
    const existingSelect = dropdownContainer.querySelector('.crossword-date-select');
    if (existingSelect) {
      existingSelect.remove();
    }
    
    const select = document.createElement('select');
    select.className = 'crossword-date-select';
    select.id = 'crossword-date-select';
    
    const dates = Object.keys(this.allPuzzles).sort((a, b) => {
      // Parse dates and compare (most recent first)
      const aDate = this.parseDate(a);
      const bDate = this.parseDate(b);
      return bDate - aDate;
    });
    
    dates.forEach(date => {
      const option = document.createElement('option');
      option.value = date;
      option.textContent = date;
      if (date === this.currentDate) {
        option.selected = true;
      }
      select.appendChild(option);
    });
    
    select.addEventListener('change', (e) => {
      this.loadPuzzleByDate(e.target.value);
    });
    
    dropdownContainer.appendChild(select);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const puzzle = new CrosswordPuzzle();
  // Create mobile input immediately
  puzzle.mobileInput = document.createElement('input');
  puzzle.mobileInput.type = 'text';
  puzzle.mobileInput.className = 'crossword-mobile-input';
  puzzle.mobileInput.setAttribute('aria-hidden', 'true');
  puzzle.mobileInput.setAttribute('tabindex', '-1');
  puzzle.mobileInput.style.position = 'fixed';
  puzzle.mobileInput.style.opacity = '0';
  puzzle.mobileInput.style.width = '1px';
  puzzle.mobileInput.style.height = '1px';
  puzzle.mobileInput.style.pointerEvents = 'none';
  puzzle.mobileInput.style.top = '0';
  puzzle.mobileInput.style.left = '0';
  puzzle.mobileInput.style.zIndex = '-1';
  puzzle.mobileInput.maxLength = 1;
  puzzle.mobileInput.inputMode = 'text';
  puzzle.mobileInput.autocomplete = 'off';
  puzzle.mobileInput.autocorrect = 'off';
  puzzle.mobileInput.autocapitalize = 'off';
  puzzle.mobileInput.spellcheck = false;
  
  // Handle input events
  puzzle.mobileInput.addEventListener('input', (e) => {
    const value = e.target.value.toUpperCase();
    if (value && /[A-Z]/.test(value)) {
      puzzle.handleKeyPress(value);
      e.target.value = ''; // Clear input after handling
    }
  });
  
  // Handle keydown for backspace
  puzzle.mobileInput.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      puzzle.handleKeyPress(e.key);
    }
  });
  
  // Prevent scrolling when input is focused
  puzzle.mobileInput.addEventListener('focus', (e) => {
    // Store current scroll position
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    // Prevent scroll by restoring position
    requestAnimationFrame(() => {
      window.scrollTo(scrollX, scrollY);
    });
  });
  
  document.body.appendChild(puzzle.mobileInput);
  puzzle.loadPuzzle();
});

