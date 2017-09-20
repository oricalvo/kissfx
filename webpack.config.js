const path = require('path');

module.exports = {
    devtool: 'inline-source-map',
    entry: './main.ts',
    resolve: {
        extensions: ['.ts', '.tsx', '.js']
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            compilerOptions: {
                                noEmit: false,
                            }
                        }
                    },
                ]
            },
            {
                test: /\.html$/,
                use: 'raw-loader'
            }
        ]
    },
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist')
    }
};
