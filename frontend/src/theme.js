import { createTheme } from '@mui/material/styles'

const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#1a1a1a',
      paper: '#2a2a2a',
    },
    primary: {
      main: '#3498db',
    },
    secondary: {
      main: '#9b59b6',
    },
    success: {
      main: '#2ecc71',
    },
    warning: {
      main: '#f1c40f',
    },
    error: {
      main: '#e74c3c',
    },
    info: {
      main: '#3498db',
    },
    text: {
      primary: '#eee',
      secondary: '#a0a0c0',
      disabled: '#888',
    },
    divider: '#3a3a3a',
  },
  typography: {
    fontFamily: "'Roboto Mono', monospace",
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
      color: '#a0a0c0',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    },
    body2: {
      fontSize: '0.85rem',
      color: '#888',
    },
    caption: {
      fontSize: '0.78rem',
      color: '#a0a0c0',
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          margin: 0,
          minHeight: '100vh',
        },
        '#root': {
          minHeight: '100vh',
        },
        'button, input, select, textarea': {
          fontFamily: 'inherit',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid #3a3a3a',
        },
      },
      defaultProps: {
        elevation: 0,
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid #3a3a3a',
        },
      },
      defaultProps: {
        elevation: 0,
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
        },
      },
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 700,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          minHeight: 40,
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 40,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          background: '#2a2a2a',
          border: '1px solid #3a3a3a',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: 'small',
        variant: 'outlined',
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          color: '#a0a0c0',
          borderColor: '#3a3a5a',
          '&.Mui-selected': {
            backgroundColor: '#3498db',
            color: '#fff',
            borderColor: '#3498db',
            '&:hover': {
              backgroundColor: '#2980b9',
            },
          },
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          height: 12,
          borderRadius: 6,
          backgroundColor: '#1e1e1e',
        },
      },
    },
  },
})

export default theme
