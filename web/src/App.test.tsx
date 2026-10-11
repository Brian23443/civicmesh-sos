import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, expect, it, vi } from 'vitest';
import { App } from './App';
import { MockClassifier } from './inference/mockClassifier';
import { ThemeProvider } from './components/ThemeProvider';
const loadModel=vi.hoisted(()=>vi.fn());
vi.mock('./inference/loadModel',()=>({loadLocalModel:loadModel}));
vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: () => ({ offlineReady: [false, vi.fn()] }) }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function() { this.removeAttribute('open'); };
});
it('navigates, moves focus, changes theme, and restores focus after the sheet closes', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><ThemeProvider><App classifier={new MockClassifier()}/></ThemeProvider></MemoryRouter>);
  expect(screen.getByText('Test classifier')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));
  expect(document.documentElement.dataset.theme).toBe('light');
  await user.click(screen.getAllByRole('link', { name: 'My reports' })[0]);
  expect(screen.getByRole('heading', { name: 'My reports' })).toBeInTheDocument();
  expect(screen.getByRole('main')).toHaveFocus();
  const opener = screen.getByRole('button', { name: 'Open RescuNote information' });
  await user.click(opener); expect(screen.getByRole('dialog')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Got it' }));
  await waitFor(() => expect(opener).toHaveFocus());
});

it('automatically loads the local model and analyzes with it',async()=>{
  const classify=vi.fn(async()=>({priority:1,hazard:2,status:2,medicalProbs:null,thirdPartyProb:null,scores:{priority:[0,1,0,0],hazard:new Array(16).fill(null),status:[0,0,1,null]}}));
  loadModel.mockResolvedValueOnce({classifier:{classify},config:{kind:'prototype'},downloadBytes:0,loadMs:0});
  const user=userEvent.setup();render(<MemoryRouter><ThemeProvider><App/></ThemeProvider></MemoryRouter>);
  await waitFor(() => expect(screen.queryByText('Loading on-device reading…')).not.toBeInTheDocument());
  await user.type(screen.getByLabelText('What’s happening? Who needs help?'),'Example smoke report');
  await user.click(screen.getByRole('button',{name:'Send for help'}));
  expect(await screen.findByText('We filled this in from your message. Tap anything that’s wrong.')).toBeInTheDocument();
  expect(classify).toHaveBeenCalledWith('Example smoke report');
  expect(loadModel).toHaveBeenCalled();
});
it('keeps manual entry available after model failure and allows retry',async()=>{
  loadModel.mockRejectedValueOnce(Error('Missing local model'));
  const user=userEvent.setup();render(<MemoryRouter><ThemeProvider><App/></ThemeProvider></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('could not start');
  expect(screen.getByRole('button',{name:'Retry model loading'})).toBeEnabled();
  await user.click(screen.getByRole('button',{name:'Can’t type? Choose from a list'}));
  expect(await screen.findByText('Tap each item to set it.')).toBeInTheDocument();
});

it('disables analysis while the model loads but permits manual reports',async()=>{
  loadModel.mockImplementationOnce(()=>new Promise(()=>{}));
  const user=userEvent.setup();render(<MemoryRouter><ThemeProvider><App/></ThemeProvider></MemoryRouter>);
  await user.type(screen.getByLabelText('What’s happening? Who needs help?'),'Help');
  expect(screen.getByRole('button',{name:'Send for help'})).toBeDisabled();
  await user.click(screen.getByRole('button',{name:'Can’t type? Choose from a list'}));
  expect(await screen.findByText('Tap each item to set it.')).toBeInTheDocument();
});
