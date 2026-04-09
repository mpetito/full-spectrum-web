import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithContext } from '../../__tests__/test-utils';
import { FileUpload } from '../FileUpload';

// Mock read3mf
vi.mock('../../lib/threemf', () => ({
  read3mf: vi.fn().mockReturnValue({
    triangles: new Float32Array(9),
    faceCount: 1,
    faceFilaments: new Uint8Array(1),
    filamentCount: 2,
    metadata: {},
  }),
}));

// Mock fetchSample
vi.mock('../../lib/samples', async () => {
  const actual = await vi.importActual('../../lib/samples');
  return {
    ...actual,
    fetchSample: vi.fn(),
  };
});

import { fetchSample } from '../../lib/samples';
import type { SampleData } from '../../lib/samples';

const mockFetchSample = vi.mocked(fetchSample);

// happy-dom doesn't implement HTMLDialogElement.showModal/close, so polyfill
beforeEach(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
});

describe('FileUpload - Sample Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "try a sample" link in the empty state', () => {
    renderWithContext(<FileUpload />);
    expect(screen.getByText('or try a sample')).toBeInTheDocument();
  });

  it('opens SamplePicker when "try a sample" is clicked', async () => {
    const user = userEvent.setup();
    renderWithContext(<FileUpload />);

    await user.click(screen.getByText('or try a sample'));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Try a Sample' })).toBeInTheDocument();
    });
  });

  it('does not open file picker when "try a sample" is clicked', async () => {
    const user = userEvent.setup();
    renderWithContext(<FileUpload />);

    const fileInput = screen.getByLabelText(/choose a 3mf/i);
    const clickSpy = vi.spyOn(fileInput, 'click');

    await user.click(screen.getByText('or try a sample'));

    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('closes SamplePicker after successful sample load', async () => {
    const user = userEvent.setup();
    const mockData: SampleData = {
      modelBuffer: new ArrayBuffer(8),
      config: {
        layerHeightMm: 0.08,
        targetFormat: 'both',
        colorMappings: [
          { inputFilament: 1, outputPalette: { type: 'cyclic', pattern: [1, 2] } },
        ],
        boundarySplit: true,
        maxSplitDepth: 9,
        boundaryStrategy: 'bisection',
      },
      filamentColors: ['#808080', '#E74C3C'],
      filename: '3DBenchy',
    };
    mockFetchSample.mockResolvedValueOnce(mockData);

    renderWithContext(<FileUpload />);

    // Open sample picker
    await user.click(screen.getByText('or try a sample'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Try a Sample' })).toBeInTheDocument();
    });

    // Click a sample to load it
    await user.click(screen.getByText('Benchy – Cyclic'));

    // Picker should close and file name should appear
    await waitFor(() => {
      expect(mockFetchSample).toHaveBeenCalledTimes(1);
    });
  });
});
