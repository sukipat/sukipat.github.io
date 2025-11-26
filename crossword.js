class CrosswordPuzzle {
  constructor() {
    this.rows = 0;
    this.cols = 0;
    this.allPuzzles = {};
    this.currentDate = '';
    this.grid = [];
    this.clues = { across: {}, down: {} };
    this.date = '';
    this.cellData = [];
    this.selectedDirection = null;
    this.selectedClueNum = null;
    this.activeCellIndex = null;
    this.userInput = [];
    this.keyboardListenerAdded = false;
    this.mobileInput = null;
    this.isComplete = false;
  }

  parseDate(dateStr) {
    const [month, day, year] = dateStr.split('/').map(Number);
    return new Date(2000 + year, month - 1, day);
  }

  async loadPuzzle() {
    try {
      const lines = (await (await fetch('puzzle.txt')).text()).trim().split('\n');
      let currentDate = '', currentGrid = [], currentClues = { across: {}, down: {} }, gridStartLine = -1;
      
      lines.forEach((line, idx) => {
        if (line.startsWith('!!')) {
          if (currentDate && gridStartLine >= 0 && currentGrid.length > 0) {
            this.allPuzzles[currentDate] = { date: currentDate, grid: currentGrid, clues: { ...currentClues } };
          }
          currentDate = line.substring(2);
          currentGrid = [];
          currentClues = { across: {}, down: {} };
          gridStartLine = idx + 1;
        } else if (gridStartLine >= 0 && line.startsWith('@')) {
          const match = line.match(/@(\d+)([ad])\s+(.+)/);
          if (match) currentClues[match[2] === 'a' ? 'across' : 'down'][parseInt(match[1])] = match[3];
        } else if (gridStartLine >= 0 && idx >= gridStartLine && line.trim() && !line.startsWith('@') && !line.startsWith('!!')) {
          currentGrid.push(line.split(''));
        }
      });
      
      if (currentDate && gridStartLine >= 0) {
        this.allPuzzles[currentDate] = { date: currentDate, grid: currentGrid, clues: { ...currentClues } };
      }
      
      const dates = Object.keys(this.allPuzzles).sort((a, b) => this.parseDate(b) - this.parseDate(a));
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
    this.rows = this.grid.length;
    this.cols = Math.max(...this.grid.map(row => row.length));
    this.userInput = [];
    this.selectedDirection = null;
    this.selectedClueNum = null;
    this.activeCellIndex = null;
    this.isComplete = false;
    if (this.mobileInput) this.mobileInput.disabled = false;
    
    this.buildCellData();
    this.render();
    this.renderDateDropdown();
  }

  buildCellData() {
    this.cellData = [];
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const char = (this.grid[row] && this.grid[row][col]) || '#';
        const isBlock = char === '#';
        this.cellData.push({ row, col, isBlock, letter: isBlock ? '' : char, clueNum: null, hasAcross: false, hasDown: false });
      }
    }
    
    const acrossStarts = [], downStarts = [];
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const idx = row * this.cols + col;
        const cell = this.cellData[idx];
        if (cell.isBlock) continue;
        
        const isStartAcross = (col === 0 || this.cellData[row * this.cols + col - 1].isBlock) && (col < this.cols - 1 && !this.cellData[row * this.cols + col + 1].isBlock);
        const isStartDown = (row === 0 || this.cellData[(row - 1) * this.cols + col].isBlock) && (row < this.rows - 1 && !this.cellData[(row + 1) * this.cols + col].isBlock);
        
        if (isStartAcross) { acrossStarts.push({row, col, idx}); cell.hasAcross = true; }
        if (isStartDown) { downStarts.push({row, col, idx}); cell.hasDown = true; }
      }
    }
    
    const allWordStarts = new Map();
    [...acrossStarts, ...downStarts].forEach(start => {
      const key = `${start.row},${start.col}`;
      if (!allWordStarts.has(key)) {
        allWordStarts.set(key, {row: start.row, col: start.col, idx: start.idx, hasAcross: start.hasAcross || false, hasDown: start.hasDown || false});
      } else {
        allWordStarts.get(key).hasAcross = allWordStarts.get(key).hasAcross || start.hasAcross;
        allWordStarts.get(key).hasDown = allWordStarts.get(key).hasDown || start.hasDown;
      }
    });
    
    Array.from(allWordStarts.values()).sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col).forEach((start, i) => {
      this.cellData[start.idx].clueNum = i + 1;
    });
    
    this.userInput = new Array(this.cellData.length).fill('');
  }

  getCellIndex(row, col) { return row * this.cols + col; }

  getCellsInDirection(row, col, direction) {
    const cells = [];
    if (direction === 'across') {
      let startCol = col;
      while (startCol > 0 && !this.cellData[this.getCellIndex(row, startCol - 1)].isBlock) startCol--;
      for (let c = startCol; c < this.cols && !this.cellData[this.getCellIndex(row, c)].isBlock; c++) {
        cells.push(this.getCellIndex(row, c));
      }
    } else {
      let startRow = row;
      while (startRow > 0 && !this.cellData[this.getCellIndex(startRow - 1, col)].isBlock) startRow--;
      for (let r = startRow; r < this.rows && !this.cellData[this.getCellIndex(r, col)].isBlock; r++) {
        cells.push(this.getCellIndex(r, col));
      }
    }
    return cells;
  }

  getClueNumForCell(row, col, direction) {
    const cells = this.getCellsInDirection(row, col, direction);
    return cells.length > 0 ? this.cellData[cells[0]].clueNum : null;
  }

  getNextWordStart(row, col, direction) {
    const currentCells = this.getCellsInDirection(row, col, direction);
    if (currentCells.length === 0) return null;
    const lastCell = this.cellData[currentCells[currentCells.length - 1]];
    let startRow = lastCell.row, startCol = lastCell.col;
    
    if (direction === 'across') {
      for (let r = startRow, startC = startCol + 1; r < this.rows; r++, startC = 0) {
        for (let c = startC; c < this.cols; c++) {
          const cell = this.cellData[this.getCellIndex(r, c)];
          if (!cell.isBlock && cell.hasAcross) return { row: r, col: c, idx: this.getCellIndex(r, c) };
        }
      }
    } else {
      for (let c = startCol, startR = startRow + 1; c < this.cols; c++, startR = 0) {
        for (let r = startR; r < this.rows; r++) {
          const cell = this.cellData[this.getCellIndex(r, c)];
          if (!cell.isBlock && cell.hasDown) return { row: r, col: c, idx: this.getCellIndex(r, c) };
        }
      }
    }
    return null;
  }

  getPreviousWordEnd(row, col, direction) {
    const currentCells = this.getCellsInDirection(row, col, direction);
    if (currentCells.length === 0) return null;
    const firstCell = this.cellData[currentCells[0]];
    let startRow = firstCell.row, startCol = firstCell.col;
    
    if (direction === 'across') {
      for (let r = startRow, startC = startCol - 1; r >= 0; r--, startC = this.cols - 1) {
        for (let c = startC; c >= 0; c--) {
          const cell = this.cellData[this.getCellIndex(r, c)];
          if (!cell.isBlock && cell.hasAcross) {
            const wordCells = this.getCellsInDirection(r, c, direction);
            if (wordCells.length > 0) {
              const endCell = this.cellData[wordCells[wordCells.length - 1]];
              return { row: endCell.row, col: endCell.col, idx: wordCells[wordCells.length - 1] };
            }
          }
        }
      }
    } else {
      for (let c = startCol, startR = startRow - 1; c >= 0; c--, startR = this.rows - 1) {
        for (let r = startR; r >= 0; r--) {
          const cell = this.cellData[this.getCellIndex(r, c)];
          if (!cell.isBlock && cell.hasDown) {
            const wordCells = this.getCellsInDirection(r, c, direction);
            if (wordCells.length > 0) {
              const endCell = this.cellData[wordCells[wordCells.length - 1]];
              return { row: endCell.row, col: endCell.col, idx: wordCells[wordCells.length - 1] };
            }
          }
        }
      }
    }
    return null;
  }

  selectCell(row, col) {
    if (this.isComplete) return;
    const idx = this.getCellIndex(row, col);
    const cell = this.cellData[idx];
    if (cell.isBlock) return;
    
    let direction = this.selectedDirection;
    if (this.selectedClueNum && this.activeCellIndex === idx && direction) {
      direction = direction === 'across' ? 'down' : 'across';
    } else {
      if (cell.hasAcross && cell.hasDown) direction = this.selectedDirection || 'across';
      else if (cell.hasAcross) direction = 'across';
      else if (cell.hasDown) direction = 'down';
      else {
        const acrossCells = this.getCellsInDirection(row, col, 'across');
        direction = acrossCells.length > 0 ? 'across' : (this.getCellsInDirection(row, col, 'down').length > 0 ? 'down' : null);
      }
    }
    
    this.selectedDirection = direction;
    this.selectedClueNum = this.getClueNumForCell(row, col, direction);
    this.activeCellIndex = idx;
    this.updateHighlighting();
  }

  updateHighlighting() {
    document.querySelectorAll('.crossword-cell').forEach(cell => cell.classList.remove('crossword-cell--selected', 'crossword-cell--highlighted'));
    document.querySelectorAll('.crossword-clue-list li').forEach(li => li.classList.remove('crossword-clue--highlighted'));
    
    if (this.selectedDirection && this.activeCellIndex !== null) {
      const cells = this.getCellsInDirection(this.cellData[this.activeCellIndex].row, this.cellData[this.activeCellIndex].col, this.selectedDirection);
      cells.forEach(idx => {
        const cellEl = document.querySelector(`[data-index="${idx}"]`);
        if (cellEl) {
          cellEl.classList.add(idx === this.activeCellIndex ? 'crossword-cell--selected' : 'crossword-cell--highlighted');
          if (idx === this.activeCellIndex && this.mobileInput) {
            const scrollY = window.scrollY, scrollX = window.scrollX;
            this.mobileInput.focus();
            requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
          }
        }
      });
      
      if (this.selectedClueNum) {
        const clueEl = document.querySelector(`[data-clue-num="${this.selectedClueNum}"][data-clue-dir="${this.selectedDirection}"]`);
        if (clueEl) clueEl.classList.add('crossword-clue--highlighted');
      }
    }
  }

  checkPuzzle() {
    for (let idx = 0; idx < this.cellData.length; idx++) {
      const cell = this.cellData[idx];
      if (!cell.isBlock && (!this.userInput[idx] || this.userInput[idx].length === 0)) return false;
      if (!cell.isBlock && (this.userInput[idx] || '').toUpperCase() !== cell.letter.toUpperCase()) return false;
    }
    return true;
  }

  handleCheckButton() {
    const isCorrect = this.checkPuzzle();
    const checkButton = document.getElementById('crossword-check-button');
    
    if (isCorrect) {
      this.isComplete = true;
      this.cellData.forEach((cell, idx) => {
        if (!cell.isBlock) {
          const cellEl = document.querySelector(`[data-index="${idx}"]`);
          if (cellEl) cellEl.classList.add('crossword-cell--correct');
        }
      });
      if (this.mobileInput) { this.mobileInput.disabled = true; this.mobileInput.blur(); }
      if (checkButton) { checkButton.disabled = true; checkButton.textContent = 'Complete!'; }
      this.selectedDirection = null;
      this.selectedClueNum = null;
      this.activeCellIndex = null;
      this.updateHighlighting();
    } else if (checkButton) {
      checkButton.classList.add('crossword-check-button--shake');
      setTimeout(() => checkButton.classList.remove('crossword-check-button--shake'), 500);
    }
  }

  handleKeyPress(key) {
    if (this.isComplete || this.activeCellIndex === null || this.selectedDirection === null) return;
    
    const cell = this.cellData[this.activeCellIndex];
    const cells = this.getCellsInDirection(cell.row, cell.col, this.selectedDirection);
    const currentIdx = cells.indexOf(this.activeCellIndex);
    const hasText = this.userInput[this.activeCellIndex]?.length > 0;
    
    if (key === 'Backspace' || key === 'Delete') {
      if (hasText) {
        this.userInput[this.activeCellIndex] = '';
        const cellEl = document.querySelector(`[data-index="${this.activeCellIndex}"] .crossword-cell__letter`);
        if (cellEl) cellEl.textContent = '';
        this.updateHighlighting();
      } else if (currentIdx > 0) {
        this.activeCellIndex = cells[currentIdx - 1];
        this.updateHighlighting();
      } else {
        const prevWord = this.getPreviousWordEnd(cell.row, cell.col, this.selectedDirection);
        if (prevWord) {
          this.selectCell(prevWord.row, prevWord.col);
          this.activeCellIndex = prevWord.idx;
        }
        this.updateHighlighting();
      }
    } else if (key.length === 1 && /[A-Za-z]/.test(key)) {
      const letter = key.toUpperCase();
      this.userInput[this.activeCellIndex] = letter;
      const cellEl = document.querySelector(`[data-index="${this.activeCellIndex}"] .crossword-cell__letter`);
      if (cellEl) cellEl.textContent = letter;
      
      if (currentIdx < cells.length - 1) {
        this.activeCellIndex = cells[currentIdx + 1];
      } else {
        const nextWord = this.getNextWordStart(cell.row, cell.col, this.selectedDirection);
        if (nextWord) {
          this.selectCell(nextWord.row, nextWord.col);
          this.activeCellIndex = nextWord.idx;
        } else {
          this.activeCellIndex = cells[0];
        }
      }
      this.updateHighlighting();
    }
  }

  render() {
    const dateEl = document.getElementById('crossword-date-display');
    if (dateEl) dateEl.textContent = this.date;
    
    const gridEl = document.querySelector('.crossword-grid');
    if (gridEl) {
      gridEl.innerHTML = '';
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
          if (cell.clueNum) indexEl.textContent = cell.clueNum;
          cellEl.appendChild(indexEl);
          
          const letterEl = document.createElement('span');
          letterEl.className = 'crossword-cell__letter';
          letterEl.textContent = this.userInput[idx] || '';
          if (this.isComplete) cellEl.classList.add('crossword-cell--correct');
          cellEl.appendChild(letterEl);
          
          if (!this.isComplete) {
            cellEl.addEventListener('click', () => this.selectCell(cell.row, cell.col));
          }
        }
        gridEl.appendChild(cellEl);
      });
    }
    
    const cluesEl = document.querySelector('.crossword-clues');
    if (cluesEl) {
      cluesEl.innerHTML = '';
      ['across', 'down'].forEach(dir => {
        const group = document.createElement('div');
        group.className = 'crossword-clue-group';
        const title = document.createElement('h3');
        title.textContent = dir.charAt(0).toUpperCase() + dir.slice(1);
        group.appendChild(title);
        const list = document.createElement('ol');
        list.className = 'crossword-clue-list';
        Object.keys(this.clues[dir]).sort((a, b) => parseInt(a) - parseInt(b)).forEach(num => {
          const li = document.createElement('li');
          li.setAttribute('value', num);
          li.setAttribute('data-clue-num', num);
          li.setAttribute('data-clue-dir', dir);
          li.textContent = this.clues[dir][num];
          list.appendChild(li);
        });
        group.appendChild(list);
        cluesEl.appendChild(group);
      });
    }
    
    if (!this.keyboardListenerAdded) {
      document.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || document.activeElement === this.mobileInput) return;
        this.handleKeyPress(e.key);
      });
      this.keyboardListenerAdded = true;
    }
  }

  renderDateDropdown() {
    const dropdownContainer = document.querySelector('.crossword-controls');
    if (!dropdownContainer) return;
    
    const existingSelect = dropdownContainer.querySelector('.crossword-date-select');
    if (existingSelect) existingSelect.remove();
    
    const select = document.createElement('select');
    select.className = 'crossword-date-select';
    select.id = 'crossword-date-select';
    Object.keys(this.allPuzzles).sort((a, b) => this.parseDate(b) - this.parseDate(a)).forEach(date => {
      const option = document.createElement('option');
      option.value = date;
      option.textContent = date;
      if (date === this.currentDate) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener('change', (e) => this.loadPuzzleByDate(e.target.value));
    dropdownContainer.appendChild(select);
    
    let checkButton = document.getElementById('crossword-check-button');
    if (!checkButton) {
      checkButton = document.createElement('button');
      checkButton.id = 'crossword-check-button';
      checkButton.className = 'crossword-check-button';
      checkButton.textContent = 'Check Puzzle';
      checkButton.addEventListener('click', () => this.handleCheckButton());
      dropdownContainer.appendChild(checkButton);
    }
    if (this.isComplete) {
      checkButton.disabled = true;
      checkButton.textContent = 'Complete!';
    } else {
      checkButton.disabled = false;
      checkButton.textContent = 'Check Puzzle';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const puzzle = new CrosswordPuzzle();
  puzzle.mobileInput = document.createElement('input');
  Object.assign(puzzle.mobileInput, {
    type: 'text',
    className: 'crossword-mobile-input',
    maxLength: 1,
    inputMode: 'text',
    autocomplete: 'off',
    autocorrect: 'off',
    autocapitalize: 'off',
    spellcheck: false
  });
  Object.assign(puzzle.mobileInput.style, {
    position: 'fixed',
    opacity: '0',
    width: '1px',
    height: '1px',
    pointerEvents: 'none',
    top: '0',
    left: '0',
    zIndex: '-1'
  });
  puzzle.mobileInput.setAttribute('aria-hidden', 'true');
  puzzle.mobileInput.setAttribute('tabindex', '-1');
  
  puzzle.mobileInput.addEventListener('input', (e) => {
    const value = e.target.value.toUpperCase();
    if (value && /[A-Z]/.test(value)) {
      puzzle.handleKeyPress(value);
      e.target.value = '';
    }
  });
  
  puzzle.mobileInput.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      puzzle.handleKeyPress(e.key);
    }
  });
  
  puzzle.mobileInput.addEventListener('focus', () => {
    const scrollY = window.scrollY, scrollX = window.scrollX;
    requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
  });
  
  document.body.appendChild(puzzle.mobileInput);
  puzzle.loadPuzzle();
});
