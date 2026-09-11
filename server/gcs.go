package main

import (
	"context"
	"io"
	"time"

	"cloud.google.com/go/storage"
	"google.golang.org/api/iterator"
)

var gcsClient *storage.Client

func initGCSClient() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	var err error
	gcsClient, err = storage.NewClient(ctx)
	return err
}

func getGCSClient() *storage.Client {
	return gcsClient
}

func downloadBlob(ctx context.Context, bucket, name string) ([]byte, error) {
	r, err := getGCSClient().Bucket(bucket).Object(name).NewReader(ctx)
	if err != nil {
		return nil, err
	}
	defer r.Close()
	return io.ReadAll(r)
}

// downloadBlobWithGeneration fetches an object and returns its GCS generation number
// alongside the bytes, so callers get data and generation in a single round trip.
func downloadBlobWithGeneration(ctx context.Context, bucket, name string) ([]byte, int64, error) {
	r, err := getGCSClient().Bucket(bucket).Object(name).NewReader(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer r.Close()
	data, err := io.ReadAll(r)
	if err != nil {
		return nil, 0, err
	}
	return data, r.Attrs.Generation, nil
}

// getGCSGeneration issues a metadata-only request to read the current generation number.
func getGCSGeneration(ctx context.Context, bucket, name string) (int64, error) {
	attrs, err := getGCSClient().Bucket(bucket).Object(name).Attrs(ctx)
	if err != nil {
		return 0, err
	}
	return attrs.Generation, nil
}

func uploadBlob(ctx context.Context, bucket, name string, data []byte, contentType string) error {
	w := getGCSClient().Bucket(bucket).Object(name).NewWriter(ctx)
	w.ContentType = contentType
	if _, err := w.Write(data); err != nil {
		w.Close()
		return err
	}
	return w.Close()
}

func deleteBlob(ctx context.Context, bucket, name string) error {
	return getGCSClient().Bucket(bucket).Object(name).Delete(ctx)
}

type blobMeta struct {
	Name    string
	Updated time.Time
	bucket  string
}

func (b *blobMeta) download(ctx context.Context) ([]byte, error) {
	return downloadBlob(ctx, b.bucket, b.Name)
}

func listBlobsMeta(ctx context.Context, bucket string) ([]*blobMeta, error) {
	var blobs []*blobMeta
	it := getGCSClient().Bucket(bucket).Objects(ctx, nil)
	for {
		attrs, err := it.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, err
		}
		blobs = append(blobs, &blobMeta{
			Name:    attrs.Name,
			Updated: attrs.Updated,
			bucket:  bucket,
		})
	}
	return blobs, nil
}
